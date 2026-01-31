from openai import OpenAI
from app.config.config import settings
import os

client = None

if settings.is_ai_ready:
    client = OpenAI(api_key=settings.OPENAI_API_KEY)


def transcribe(audio_path: str) -> dict:
    # MOKE LOGIC
    if not client:
        if not settings.is_ai_ready:
            print(f"🛠️  MOCK WHISPER: Simulating transcription for {audio_path}")
            return {
                "text": "こんにちは、元気ですか？ はい、元気です！",
                "segments": [
                    {
                        "id": 0,
                        "start": 0.0,
                        "end": 2.5,
                        "text": "こんにちは、元気ですか？",
                    },
                    {"id": 1, "start": 2.6, "end": 4.5, "text": "はい、元気です！"},
                ],
                "duration": 4.5,
            }

    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    try:
        with open(audio_path, "rb") as audio:
            transcript = client.audio.transcriptions.create(
                model="whisper-1", file=audio, response_format="verbose_json"
            )
    except Exception as e:
        raise RuntimeError(f"Failed to transcribe audio: {str(e)}") from e

    return transcript
