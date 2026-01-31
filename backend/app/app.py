from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from app.workers.ingest import ingest_scene
from fastapi import UploadFile, File
import tempfile
import os
from app.workers.evaluate import evaluate_line
from fastapi import UploadFile, File, Form


app = FastAPI()


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
