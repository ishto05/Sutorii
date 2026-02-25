from app.config.config import settings
import os
from app.services.rate_limit import check_rate_limit


def transcribe(audio_path: str) -> dict:
    client = settings.openai_client

    if settings.is_ai_ready:
        check_rate_limit("whisper")

    # MOCK LOGIC: Always return mock if AI is disabled or key is missing
    if not settings.AI_ENABLED or not client:
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
            response = client.audio.transcriptions.create(
                model="whisper-1", file=audio, response_format="verbose_json"
            )
            # Response is a Transcription object, convert to dict for downstream services
            transcript = response.model_dump()
        print("🎙️ Whisper transcription successful.")
    except Exception as e:
        raise RuntimeError(f"⚠️ Failed to transcribe audio: {str(e)}") from e

    return transcript
