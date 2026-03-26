"""
services/characterid_client.py
─────────────────────────────────────────────────────────────────────────────
Client for the Colab-hosted Character Identification service (Colab B).

Reads two env vars (via settings):
    COLAB_CHARACTERID_URL  — ngrok public URL printed by the Colab B notebook
    COLAB_API_SECRET       — shared secret (same one used for Colab A)

Contract:
    POST /identify
        form fields:
            youtube_url (str, required)  — original YouTube URL (Colab B re-downloads sections)
            yt_title    (str, optional)  — title extracted from yt-dlp metadata
            user_title  (str, optional)  — title provided by the user at ingest time
            segments    (JSON str)       — WhisperX diarized segments

    Response (200):
        {
            "segments": [
                {"start": 0.0, "end": 2.4, "text": "...", "speaker": "TANJIRO"},
                ...
            ],
            "character_map": {
                "TANJIRO": {"actor": "Natsuki Hanae", "confidence": 0.91},
                "NEZUKO":  {"actor": "Akari Kito",    "confidence": 0.87},
                "SPEAKER_02": null   # unmatched — kept as fallback label
            }
        }

    On failure or timeout → caller logs warning and continues with SPEAKER_XX labels.
─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
from typing import Optional

import httpx

from app.config.config import settings

logger = logging.getLogger(__name__)


def is_characterid_service_configured() -> bool:
    """True if the Colab B URL env var is set."""
    return bool(settings.COLAB_CHARACTERID_URL)


def relabel_segments_with_characters(
    youtube_url: str,
    segments: list,
    yt_title: Optional[str] = None,
    user_title: Optional[str] = None,
    timeout_seconds: int = 300,
) -> dict:
    """
    Send the YouTube URL + diarized segments to Colab B.
    Colab B re-downloads only the video sections it needs, runs the
    full face identification pipeline, and returns relabeled segments.

    Falls back gracefully — caller should catch exceptions and continue
    with the original SPEAKER_XX labels if this fails.
    """
    base_url = settings.COLAB_CHARACTERID_URL.rstrip("/")
    if not base_url:
        raise RuntimeError(
            "COLAB_CHARACTERID_URL is not set. "
            "Start the Colab B notebook and copy the ngrok URL into your .env."
        )

    endpoint = f"{base_url}/identify"
    headers = {"X-Api-Secret": settings.COLAB_API_SECRET}

    form_data: dict = {
        "youtube_url": youtube_url,
        "segments": json.dumps(segments, ensure_ascii=False),
    }
    if yt_title:
        form_data["yt_title"] = yt_title
    if user_title:
        form_data["user_title"] = user_title

    logger.info(
        "Sending %d segments to Colab CharacterID at %s (url=%s)",
        len(segments),
        base_url,
        youtube_url,
    )

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(
            endpoint,
            headers=headers,
            data=form_data,   # no file — pure form data
        )

    if response.status_code == 401:
        raise RuntimeError(
            "Colab CharacterID service rejected the request — check that "
            "COLAB_API_SECRET in your .env matches API_SECRET in Colab B."
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"Colab CharacterID service returned {response.status_code}: {response.text}"
        )

    result = response.json()
    seg_count = len(result.get("segments", []))
    char_map = result.get("character_map", {})
    named = sum(1 for v in char_map.values() if v is not None)

    logger.info(
        "CharacterID done: %d segments, %d/%d speakers named",
        seg_count,
        named,
        len(char_map),
    )
    print(f"🎭 Character map: {char_map}")

    return result


def check_characterid_health() -> dict:
    """Call /health on the Colab B service."""
    base_url = settings.COLAB_CHARACTERID_URL.rstrip("/")
    if not base_url:
        raise RuntimeError("COLAB_CHARACTERID_URL is not set.")

    with httpx.Client(timeout=10) as client:
        response = client.get(f"{base_url}/health")

    if response.status_code != 200:
        raise RuntimeError(f"CharacterID health check failed: {response.status_code}")

    return response.json()