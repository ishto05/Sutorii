from pydantic import BaseModel
from typing import List, Optional, Literal
from datetime import datetime


SpeakerRole = Literal["NPC", "USER"]


class SceneLine(BaseModel):
    id: str
    speaker: SpeakerRole
    text: str
    startTime: float
    endTime: float

    phonemes: Optional[List[str]] = None
    pitchPattern: Optional[List[int]] = None


class ScenePackage(BaseModel):
    sceneId: str
    language: Literal["ja"]
    source: dict
    audio: dict
    script: List[SceneLine]
    metadata: dict


class EvaluationResult(BaseModel):
    evaluationId: str
    sceneId: str
    lineId: str

    transcript: str

    scores: dict
    wordScores: list
    feedback: dict

    phonemeScore: Optional[float] = None
    alignmentMap: Optional[dict] = None

    metadata: dict
