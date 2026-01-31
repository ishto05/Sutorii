from openai import OpenAI
from app.config.config import settings
from pydantic import BaseModel
from typing import List, Literal
import json

# Only initialize if key exists to avoid OpenAI library internal errors
client = None
if settings.is_ai_ready:
    client = OpenAI(api_key=settings.OPENAI_API_KEY)


class GPTSceneLine(BaseModel):
    speaker: Literal["NPC", "USER"]
    text: str
    startTime: float
    endTime: float


class ScriptResponse(BaseModel):
    lines: List[GPTSceneLine]


def refine_script_from_whisper(whisper_result: dict) -> List[GPTSceneLine]:
    """
    Takes Whisper verbose JSON (with segments)
    Returns structured dialogue lines with timestamps
    """

    # MOCK LOGIC
    if not client:
        print("🛠️  MOCK GPT: Returning structured dummy dialogue lines...")
        return [
            GPTSceneLine(
                speaker="NPC",
                text="こんにちは、元気ですか？",
                startTime=0.0,
                endTime=2.5,
            ),
            GPTSceneLine(
                speaker="USER", text="はい、元気です！", startTime=2.6, endTime=4.5
            ),
        ]

    segments = whisper_result.get("segments", [])
    if not segments:
        raise ValueError("Whisper result missing segments; cannot build script")

    completion = client.beta.chat.completions.parse(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a Japanese dialogue editor for a language learning app.\n"
                    "You are given speech segments with timestamps.\n"
                    "Split them into short, natural dialogue lines.\n\n"
                    "IMPORTANT TEXT RULES:\n"
                    "- Preserve the original Japanese sentence structure.\n"
                    "- Keep kanji in the text.\n"
                    "- For EVERY kanji word, add its reading in hiragana or katakana in parentheses immediately after the word.\n"
                    "- Do NOT remove kanji.\n"
                    "- Do NOT romanize.\n"
                    "- Example: 元気ですか？ → 元気(げんき)ですか？\n\n"
                    "SPEAKER RULES:\n"
                    "- NPC = video speaker\n"
                    "- USER = learner response\n\n"
                    "TIMING RULES:\n"
                    "- Use the provided timestamps.\n"
                    "- Do NOT invent new times.\n\n"
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

    return completion.choices[0].message.parsed.lines
