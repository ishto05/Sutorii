from app.config.config import settings
from pydantic import BaseModel
from typing import List, Literal, Optional
import json
from app.services.rate_limit import check_rate_limit
from app.models.schema import WordToken, QuizQuestion

# ─────────────────────────────────────────────────────────────────────────────
# GPT response models
# ─────────────────────────────────────────────────────────────────────────────


class GPTSceneLine(BaseModel):
    characterName: str
    text: str
    phoneticReading: Optional[str] = None
    translation: Optional[str] = None
    startTime: float
    endTime: float
    words: List[WordToken] = []


class GPTQuizQuestion(BaseModel):
    type: Literal["vocabulary", "comprehension", "grammar"]
    question: str
    expectedAnswer: str
    relatedLineId: Optional[str] = None


class ScriptResponse(BaseModel):
    characters: List[str]
    lines: List[GPTSceneLine]
    quiz: List[GPTQuizQuestion]


# ─────────────────────────────────────────────────────────────────────────────
# Quiz count helper
# ─────────────────────────────────────────────────────────────────────────────


def _quiz_count_for_scene(line_count: int) -> int:
    if line_count < 5:
        return 2
    elif line_count <= 10:
        return 3
    else:
        return 5


# ─────────────────────────────────────────────────────────────────────────────
# Main function
# ─────────────────────────────────────────────────────────────────────────────


def refine_script_from_whisper(whisper_result: dict) -> ScriptResponse:
    client = settings.openai_client

    if client:
        check_rate_limit("gpt")

    # Estimate line count from segments to determine quiz size
    segments = whisper_result.get("segments", [])
    quiz_count = _quiz_count_for_scene(len(segments))

    # ── MOCK ─────────────────────────────────────────────────────────────────
    if not settings.AI_ENABLED or not client:
        print("🛠️  MOCK GPT: Returning structured dummy dialogue lines...")
        return ScriptResponse(
            characters=["Character 1", "Character 2"],
            lines=[
                GPTSceneLine(
                    characterName="Character 1",
                    text="こんにちは、元気(げんき)ですか？",
                    phoneticReading="こんにちは、げんきですか？",
                    translation="Hello, how are you?",
                    startTime=0.0,
                    endTime=2.5,
                    words=[
                        WordToken(
                            word="こんにちは", reading="こんにちは", meaning="hello"
                        ),
                        WordToken(
                            word="元気", reading="げんき", meaning="energy / health"
                        ),
                    ],
                ),
                GPTSceneLine(
                    characterName="Character 2",
                    text="はい、元気(げんき)です！",
                    phoneticReading="はい、げんきです！",
                    translation="Yes, I am fine!",
                    startTime=2.6,
                    endTime=4.5,
                    words=[
                        WordToken(word="はい", reading="はい", meaning="yes"),
                        WordToken(
                            word="元気", reading="げんき", meaning="energy / health"
                        ),
                    ],
                ),
            ],
            quiz=[
                GPTQuizQuestion(
                    type="vocabulary",
                    question="What does 元気 mean?",
                    expectedAnswer="energy / health",
                    relatedLineId=None,
                ),
                GPTQuizQuestion(
                    type="comprehension",
                    question="What did Character 1 ask Character 2?",
                    expectedAnswer="How are you",
                    relatedLineId=None,
                ),
            ],
        )

    # ── REAL GPT CALL ─────────────────────────────────────────────────────────
    if not segments:
        raise ValueError("Whisper result missing segments; cannot build script")

    completion = client.beta.chat.completions.parse(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a language learning content editor.\n"
                    "You are given speech segments with timestamps from a video.\n\n"
                    "YOUR TASKS:\n"
                    "1. Split segments into short, natural dialogue lines.\n"
                    "2. Identify unique characters (use descriptive names like 'Teacher', 'Student', or 'Character 1').\n"
                    "3. For each line provide word-level breakdown.\n"
                    f"4. Generate exactly {quiz_count} quiz questions from the scene.\n\n"
                    "TEXT RULES:\n"
                    "- Preserve the original sentence structure.\n"
                    "- Keep kanji. For every kanji word add its reading in parentheses: 元気(げんき).\n"
                    "- Do NOT romanize.\n\n"
                    "WORD RULES:\n"
                    "- For each line, return every meaningful word.\n"
                    "- Treat compound words and common word pairs as single tokens (e.g. 感じ not 感+じ).\n"
                    "- Do NOT split words at the character level.\n"
                    "- Include: word (original), reading (hiragana/katakana), meaning (English).\n\n"
                    "QUIZ RULES:\n"
                    f"- Generate exactly {quiz_count} questions.\n"
                    "- Mix types: vocabulary, comprehension, grammar.\n"
                    "- Questions must be asked in English.\n"
                    "- expectedAnswer must be the correct answer in the language being studied.\n"
                    "- relatedLineId should reference the line index (e.g. 'line-1') if applicable.\n\n"
                    "Return ONLY structured data matching the required schema.\n"
                    "Do not include explanations or markdown."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(segments, ensure_ascii=False),
            },
        ],
        response_format=ScriptResponse,
    )

    if not completion.choices or not completion.choices[0].message.parsed:
        raise ValueError("Empty or invalid structured response from GPT API")

    return completion.choices[0].message.parsed
