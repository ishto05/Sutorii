"""
services/whisperx_client.py
─────────────────────────────────────────────────────────────────────────────
Client for the Colab-hosted WhisperX diarization service.

Reads two env vars (via settings):
    COLAB_WHISPERX_URL    — ngrok public URL printed by the Colab notebook
    COLAB_API_SECRET      — shared secret (must match the one set in Colab Cell 2)

Usage:
    from app.services.whisperx_client import transcribe_with_diarization

    result = await transcribe_with_diarization(
        audio_path="/tmp/audio.mp3",
        min_speakers=1,
        max_speakers=4,
    )
─────────────────────────────────────────────────────────────────────────────
"""

import logging
from pathlib import Path
from typing import Optional

import httpx
from app.config.config import settings

logger = logging.getLogger(__name__)


def is_colab_service_configured() -> bool:
    """True if the Colab URL env var is set. Used to decide whether to use this service."""
    return bool(settings.COLAB_WHISPERX_URL)


def transcribe_with_diarization(
    audio_path: str,
    num_speakers: Optional[int] = None,
    min_speakers: Optional[int] = None,
    max_speakers: Optional[int] = None,
    timeout_seconds: int = 300,  # 5 min — large files can be slow
) -> dict:
    """
    Send an audio file to the Colab WhisperX service and return diarized segments.
    """
    base_url = settings.COLAB_WHISPERX_URL.rstrip("/")
    if not base_url:
        raise RuntimeError(
            "COLAB_WHISPERX_URL is not set. "
            "Start the Colab notebook and copy the ngrok URL into your .env."
        )

    audio_file = Path(audio_path)
    if not audio_file.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    endpoint = f"{base_url}/transcribe"
    headers = {"X-Api-Secret": settings.COLAB_API_SECRET}

    # Build multipart form data
    form_data: dict = {}
    if num_speakers is not None:
        form_data["num_speakers"] = str(num_speakers)
    if min_speakers is not None:
        form_data["min_speakers"] = str(min_speakers)
    if max_speakers is not None:
        form_data["max_speakers"] = str(max_speakers)

    file_size_mb = audio_file.stat().st_size / 1_000_000
    logger.info(
        "Sending %s (%.1f MB) to Colab WhisperX service at %s",
        audio_file.name,
        file_size_mb,
        base_url,
    )

    with httpx.Client(timeout=timeout_seconds) as client:
        with open(audio_path, "rb") as f:
            response = client.post(
                endpoint,
                headers=headers,
                files={"audio": (audio_file.name, f, _mime_type(audio_file))},
                data=form_data,
            )

    if response.status_code == 401:
        raise RuntimeError(
            "Colab service rejected the request — check that COLAB_API_SECRET "
            "in your .env matches API_SECRET in the Colab notebook (Cell 2)."
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"Colab WhisperX service returned {response.status_code}: {response.text}"
        )

    result = response.json()
    seg_count = len(result.get("segments", []))
    elapsed = result.get("processing_time_seconds", "?")
    logger.info(
        "WhisperX done: %d segments in %ss (language=%s)",
        seg_count,
        elapsed,
        result.get("language"),
    )
    print(result)

    return result


def check_colab_health() -> dict:
    """
    Call /health on the Colab service.
    """
    base_url = settings.COLAB_WHISPERX_URL.rstrip("/")
    if not base_url:
        raise RuntimeError("COLAB_WHISPERX_URL is not set.")

    with httpx.Client(timeout=10) as client:
        response = client.get(f"{base_url}/health")

    if response.status_code != 200:
        raise RuntimeError(f"Health check failed: {response.status_code}")

    return response.json()


def _mime_type(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
    }.get(ext, "application/octet-stream")
