from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from app.workers.ingest import ingest_scene

app = FastAPI()

# 1. Define the expected request shape
class IngestRequest(BaseModel):
    youtube_url: str

@app.get("/health")
def health():
    return {"status": "online"}

@app.post("/ingest")
def ingest(request: IngestRequest): # 2. Use the model here
    try:
        # FastAPI automatically validates that youtube_url exists now
        scene = ingest_scene(request.youtube_url)
        return scene.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))