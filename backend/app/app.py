from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
from app.workers.ingest import ingest_scene
from fastapi import UploadFile, File
import tempfile
import os
from app.workers.evaluate import evaluate_line
from fastapi import Form
from fastapi.middleware.cors import CORSMiddleware
from app.config.config import settings


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 1. Define the expected request shape
class IngestRequest(BaseModel):
    youtube_url: str


@app.get("/health")
def health():
    return {"status": "online"}


@app.post("/ingest")
def ingest(request: IngestRequest):  # 2. Use the model here
    try:
        # FastAPI automatically validates that youtube_url exists now
        scene = ingest_scene(request.youtube_url)
        return scene.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/evaluate")
async def evaluate(
    sceneId: str = Form(...),
    lineId: str = Form(...),
    expectedText: str = Form(...),
    audio: UploadFile = File(...),
):
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(await audio.read())
            tmp_path = tmp.name

        result = evaluate_line(
            scene_id=sceneId,
            line_id=lineId,
            expected_text=expectedText,
            audio_path=tmp_path,
        )

        return result.model_dump()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        if "tmp_path" in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.get("/pitch/{scene_id}")
def get_pitch(scene_id: str, response: Response):
    """
    Poll this endpoint after receiving a ScenePackage from /ingest.

    Returns:
        202 — pitch extraction still running
        200 — pitch data ready, includes per-line pitch contours
        404 — scene not found (invalid ID or TTL expired)

    Frontend strategy:
        1. Receive ScenePackage from /ingest
        2. Wait ~3 seconds
        3. Poll this endpoint every 2 seconds (max 10 attempts)
        4. On 200 → merge pitchPattern into each SceneLine by lineId
        5. On 404 after retries → render UI without pitch visualization
    """
    result = get_pitch_result(scene_id)

    if result is None:
        raise HTTPException(
            status_code=404, detail="Pitch data not found for this scene."
        )

    if result["status"] == "processing":
        response.status_code = 202
        return {"status": "processing", "sceneId": scene_id}

    # Pitch is ready — delete from Redis after serving (TTL would handle it
    # anyway but this frees memory immediately)
    delete_pitch_result(scene_id)

    return {
        "status": "ready",
        "sceneId": scene_id,
        "lines": result["lines"],  # [{ lineId, pitchPattern: [float] }]
    }
