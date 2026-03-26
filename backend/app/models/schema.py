from pydantic import BaseModel
from typing import List, Optional, Literal


class WordToken(BaseModel):
    word: str
    reading: Optional[str] = None
    meaning: Optional[str] = None
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
    pitchPattern: Optional[List[float]] = None


class QuizQuestion(BaseModel):
    questionId: str
    type: Literal["vocabulary", "comprehension", "grammar"]
    question: str
    expectedAnswer: str
    targetLanguage: str
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


# ─────────────────────────────────────────────────────────────────────────────
# Evaluation models v2
# ─────────────────────────────────────────────────────────────────────────────

class PhonemeScore(BaseModel):
    phoneme: str        # IPA or language-specific symbol
    score: float        # 0-100


class WordEvaluation(BaseModel):
    word: str
    score: float                        # 0-100 pronunciation accuracy
    phonemes: List[PhonemeScore] = []


class LineScores(BaseModel):
    overall: float          # weighted final 0-100
    textAccuracy: float     # Levenshtein + coverage
    pronunciation: float    # Azure word-level average
    fluency: float          # Azure fluency
    completeness: float     # Azure completeness
    pitchAccuracy: float    # DTW comparison, -1.0 if pitch data unavailable


class LineFeedback(BaseModel):
    summary: str
    tips: List[str] = []


class EvaluationResult(BaseModel):
    evaluationId: str
    sceneId: str
    lineId: str
    expectedText: str
    transcript: str
    scores: LineScores
    wordScores: List[WordEvaluation] = []
    pitchFeedback: Optional[str] = None   # "good"|"flat"|"rising"|"falling"
    feedback: LineFeedback
    metadata: dict


class SessionEvaluation(BaseModel):
    sessionId: str
    sceneId: str
    overallScore: float
    linesEvaluated: int
    lines: List[EvaluationResult]
    sessionFeedback: str
    metadata: dict