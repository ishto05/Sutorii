"""
services/pitch_cache.py
─────────────────────────────────────────────────────────────────────────────
Handles storing and retrieving pitch extraction results via Redis.

Key format : pitch:{sceneId}
TTL        : 1 hour (pitch data is temporary — once frontend has it, done)
─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
from typing import Optional

import redis

from app.config.config import settings

logger = logging.getLogger(__name__)

# TTL for pitch data in Redis — 1 hour
PITCH_TTL_SECONDS = 3600

# Sentinel value stored while extraction is still running
STATUS_PROCESSING = "__processing__"


def _get_client() -> Optional[redis.Redis]:
    """
    Returns a Redis client or None if Redis is not configured.
    """
    if not settings.REDIS_URL:
        logger.warning("REDIS_URL not configured — pitch caching unavailable.")
        return None
    try:
        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.ping()
        return client
    except Exception as e:
        logger.warning("Redis connection failed: %s", e)
        return None


def mark_pitch_processing(scene_id: str) -> None:
    """
    Mark a scene's pitch extraction as in-progress.
    Called immediately when background thread is spawned.
    """
    client = _get_client()
    if not client:
        return
    try:
        key = f"pitch:{scene_id}"
        client.set(key, STATUS_PROCESSING, ex=PITCH_TTL_SECONDS)
        print(f"📌 Pitch status marked as processing for scene: {scene_id}")
    except Exception as e:
        logger.warning("Failed to mark pitch as processing: %s", e)


def store_pitch_result(scene_id: str, pitch_data: list) -> None:
    """
    Store completed pitch contours in Redis.
    pitch_data is a list of:
        { lineId: str, pitchPattern: List[float] }

    Called by background thread after extraction is complete.
    """
    client = _get_client()
    if not client:
        return
    try:
        key = f"pitch:{scene_id}"
        payload = json.dumps(pitch_data)
        client.set(key, payload, ex=PITCH_TTL_SECONDS)
        print(f"✅ Pitch result stored in Redis for scene: {scene_id}")
    except Exception as e:
        logger.warning("Failed to store pitch result: %s", e)


def get_pitch_result(scene_id: str) -> Optional[dict]:
    """
    Retrieve pitch result from Redis.

    Returns:
        { "status": "processing" }           — still running
        { "status": "ready", "lines": [...] } — complete
        None                                  — not found / Redis unavailable
    """
    client = _get_client()
    if not client:
        return None
    try:
        key = f"pitch:{scene_id}"
        value = client.get(key)

        if value is None:
            return None

        if value == STATUS_PROCESSING:
            return {"status": "processing"}

        lines = json.loads(value)
        return {"status": "ready", "lines": lines}

    except Exception as e:
        logger.warning("Failed to get pitch result: %s", e)
        return None


def delete_pitch_result(scene_id: str) -> None:
    """
    Explicitly delete pitch data from Redis.
    Optional — TTL handles cleanup automatically,
    but useful if you want to free memory immediately after frontend fetches.
    """
    client = _get_client()
    if not client:
        return
    try:
        client.delete(f"pitch:{scene_id}")
        print(f"🗑️  Pitch data deleted from Redis for scene: {scene_id}")
    except Exception as e:
        logger.warning("Failed to delete pitch result: %s", e)
