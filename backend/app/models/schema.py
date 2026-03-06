from pydantic import BaseModel
from typing import List, Optional, Literal
from datetime import datetime


class WordToken(BaseModel):
    word: str
    reading: Optional[str] = None  # げんき
    meaning: Optional[str] = None  # energy / health
    startTime: Optional[float] = None
    endTime: Optional[float] = None


class SceneLine(BaseModel):
    id: str
    characterName: str
    text: str
    phoneticReading: Optional[str] = None
    transliteration: Optional[str] = None
    translation: Optional[str] = None
    startTime: float
    endTime: float
    words: Optional[List[WordToken]] = []
    phonemes: Optional[List[str]] = None
    pitchPattern: Optional[List[float]] = None  # Hz float values, 0.0 = unvoiced


class QuizQuestion(BaseModel):
    questionId: str
    type: Literal["vocabulary", "comprehension", "grammar"]
    question: str  # asked in English
    expectedAnswer: str  # correct answer in target language
    targetLanguage: str  # language being studied e.g. "ja"
    relatedLineId: Optional[str] = None


class ScenePackage(BaseModel):
    sceneId: str
    language: str
    sourceLanguage: str
    uniqueCharacters: List[str] = []
    source: dict
    audio: dict
    script: List[SceneLine]
    quiz: Optional[List[QuizQuestion]] = None
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
