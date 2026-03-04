import logging
import os
from typing import Optional

from app.config.config import settings
from app.services.rate_limit import check_rate_limit
from app.services.whisperX_client import (
    is_colab_service_configured,
    transcribe_with_diarization,
)

logger = logging.getLogger(__name__)


def transcribe(
    audio_path: str,
    min_speakers: Optional[int] = None,
    max_speakers: Optional[int] = None,
) -> dict:
    """
    Transcribe audio. Returns a dict compatible with previous implementation:
        {
            "text": "...",
            "segments": [...],
            "language": "ja",
            "duration": 0.0,
            "source": "whisperx" | "openai_whisper" | "mock"
        }
    """
    # ── 1. Colab WhisperX path ────────────────────────────────────────────────
    if is_colab_service_configured():
        logger.info("Using Colab WhisperX service for transcription")
        try:
            result = transcribe_with_diarization(
                audio_path=audio_path,
                min_speakers=min_speakers,
                max_speakers=max_speakers,
            )
            return _normalize_result(result, source="whisperx")
        except Exception as e:
            logger.warning(
                "Colab WhisperX failed (%s) — falling back to OpenAI Whisper", e
            )
            # Fall through to OpenAI path

    # ── 2. OpenAI Whisper API path (existing logic) ───────────────────────────
    client = settings.openai_client
    if not settings.AI_ENABLED or not client:
        logger.info("AI disabled — returning mock transcription")
        return _mock_result()

    check_rate_limit("whisper")

    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    logger.info("Using OpenAI Whisper API for transcription")
    try:
        with open(audio_path, "rb") as f:
            response = client.audio.transcriptions.create(
                model="whisper-1", file=f, response_format="verbose_json", language="ja"
            )
        raw = response.model_dump()
        return _normalize_result(raw, source="openai_whisper")
    except Exception as e:
        logger.error(f"⚠️ OpenAI Whisper failed: {e}")
        raise RuntimeError(f"⚠️ Failed to transcribe audio: {str(e)}") from e


def _normalize_result(raw: dict, source: str) -> dict:
    """
    Normalize different provider outputs into a unified shape.
    """
    segments = raw.get("segments", [])
    
    # Calculate duration if missing (common in some WhisperX responses)
    duration = raw.get("duration")
    if duration is None and segments:
        duration = segments[-1].get("end", 0.0)
    
    # Consolidate text if missing
    text = raw.get("text")
    if text is None:
        text = " ".join([s.get("text", "").strip() for s in segments]).strip()

    # Ensure speaker labels exist for OpenAI (default to SPEAKER_00)
    for seg in segments:
        if "speaker" not in seg:
            seg["speaker"] = "SPEAKER_00"

    return {
        "text": text,
        "segments": segments,
        "language": raw.get("language", "ja"),
        "duration": duration or 0.0,
        "source": source,
    }


def _mock_result() -> dict:
    return {
        "text": "こんにちは、元気ですか？ はい、元気です！",
        "language": "ja",
        "source": "mock",
        "duration": 4.5,
        "segments": [
            {
                "id": 0,
                "start": 0.0,
                "end": 2.5,
                "text": "こんにちは、元気ですか？",
                "speaker": "SPEAKER_00",
                "words": [],
            },
            {
                "id": 1,
                "start": 2.6,
                "end": 4.5,
                "text": "はい、元気です！",
                "speaker": "SPEAKER_01",
                "words": [],
            },
        ],
    }
