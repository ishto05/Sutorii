from fastapi import FastAPI, HTTPException, Response, Request
from pydantic import BaseModel
from typing import Optional
from app.workers.ingest import ingest_scene, preview_scene
from app.workers.evaluate import evaluate_session
import tempfile
import os
import json
from fastapi.middleware.cors import CORSMiddleware
from app.config.config import settings
from app.services.pitch_cache import get_pitch_result, delete_pitch_result


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Ingest
# ─────────────────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    youtube_url: str
    phase: str = "confirm"          # "preview" | "confirm"
    user_title: Optional[str] = None
    translation_language: str = "English"
    native_language: str = "en"
    transliteration_enabled: bool = True


@app.get("/health")
def health():
    return {"status": "online"}


@app.post("/ingest")
def ingest(request: IngestRequest):
    try:
        if request.phase == "preview":
            return preview_scene(request.youtube_url)

        scene = ingest_scene(
            youtube_url=request.youtube_url,
            user_title=request.user_title,
            translation_language=request.translation_language,
            native_language=request.native_language,
            transliteration_enabled=request.transliteration_enabled,
        )
        return scene.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Evaluate — session-based multi-line evaluation
#
# POST /evaluate/session
# Content-Type: multipart/form-data
#
# Fields:
#   sceneId       string
#   sourceLang    string   ISO 639-1 e.g. "ja", "en"  (default: "en")
#   lineCount     int      number of recorded lines
#   pitchData     string   optional JSON { lineId: pitchPattern[] }
#   line_{i}_id    string   lineId for recording i  (i = 0..lineCount-1)
#   line_{i}_text  string   expected text for recording i
#   line_{i}_audio File     audio blob for recording i
#
# Returns: SessionEvaluationResult
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/evaluate/session")
async def evaluate_session_endpoint(request: Request):
    """
    Session evaluation — called once at end of roleplay.
    Handles dynamic multipart form with N recordings.
    """
    form = await request.form()

    scene_id        = form.get("sceneId")
    # sourceLang must be sent by frontend from ScenePackage.language
    # e.g. "ja", "en", "ko". Falls back to "unknown" if missing,
    # which Azure handles gracefully (defaults to en-US locale).
    source_lang     = form.get("sourceLang") or "unknown"
    line_count_raw  = form.get("lineCount", "0")
    pitch_data_raw  = form.get("pitchData")

    if not scene_id:
        raise HTTPException(status_code=400, detail="sceneId is required")

    try:
        line_count = int(line_count_raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="lineCount must be an integer")

    if line_count == 0:
        raise HTTPException(status_code=400, detail="lineCount must be > 0")

    # Parse optional pitch map { lineId: [float, ...] }
    pitch_map = {}
    if pitch_data_raw:
        try:
            pitch_map = json.loads(pitch_data_raw)
        except Exception:
            pass  # pitch is optional — proceed without it

    recordings = []
    tmp_paths  = []

    try:
        for i in range(line_count):
            line_id       = form.get(f"line_{i}_id")
            expected_text = form.get(f"line_{i}_text")
            audio_upload  = form.get(f"line_{i}_audio")

            if not line_id or not expected_text or not audio_upload:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing fields for recording {i}: need line_{i}_id, line_{i}_text, line_{i}_audio",
                )

            # Determine file extension from upload filename
            suffix = ".webm"
            if hasattr(audio_upload, "filename") and audio_upload.filename:
                ext = os.path.splitext(audio_upload.filename)[-1].lower()
                if ext in (".wav", ".webm", ".mp3", ".m4a", ".ogg"):
                    suffix = ext

            # Save to temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                content = await audio_upload.read()
                tmp.write(content)
                tmp_path = tmp.name

            tmp_paths.append(tmp_path)

            # Get stored native pitch for this line if available
            native_pitch = pitch_map.get(line_id)

            recordings.append({
                "line_id":       line_id,
                "expected_text": expected_text,
                "audio_path":    tmp_path,
                "native_pitch":  native_pitch,
                "line_start":    0.0,   # full recording per line, no slicing needed
                "line_end":      0.0,
            })

        # Run full session evaluation
        result = evaluate_session(
            scene_id=scene_id,
            recordings=recordings,
            language_code=source_lang,
        )

        return result.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Always clean up temp audio files
        for path in tmp_paths:
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Pitch polling
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/pitch/{scene_id}")
def get_pitch(scene_id: str, response: Response):
    """
    Poll after /ingest to get pitch contours for each line.
    202 → still processing | 200 → ready | 404 → not found/expired
    """
    result = get_pitch_result(scene_id)

    if result is None:
        raise HTTPException(status_code=404, detail="Pitch data not found for this scene.")

    if result["status"] == "processing":
        response.status_code = 202
        return {"status": "processing", "sceneId": scene_id}

    delete_pitch_result(scene_id)

    return {
        "status": "ready",
        "sceneId": scene_id,
        "lines": result["lines"],
    }