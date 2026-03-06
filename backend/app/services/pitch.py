"""
services/pitch.py
─────────────────────────────────────────────────────────────────────────────
Extracts pitch contour (F0) from audio slices using librosa.pyin().

- Runs per SceneLine using startTime / endTime to slice the full audio.
- Stores Hz float values. Unvoiced frames → 0.0.
- Designed to run as a background thread — never raises, always returns [].
- Stores results in Redis via pitch_cache.py.
- Cleans up the audio file after extraction is complete.
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import os
import threading
from typing import List

import numpy as np

from app.models.schema import SceneLine
from app.services.pitch_cache import (
    mark_pitch_processing,
    store_pitch_result,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

F0_MIN_HZ = 70  # low male voice
F0_MAX_HZ = 400  # high female / child voice
SAMPLE_RATE = 16000


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────


def extract_pitch_for_line(audio_path: str, start: float, end: float) -> List[float]:
    """
    Extract pitch contour for a single audio segment.

    Returns list of F0 values in Hz. Unvoiced frames are 0.0.
    Returns [] on any failure.
    """
    try:
        import librosa

        duration = max(end - start, 0.1)
        y, sr = librosa.load(
            audio_path,
            sr=SAMPLE_RATE,
            offset=start,
            duration=duration,
            mono=True,
        )

        if len(y) == 0:
            return []

        f0, voiced_flag, _ = librosa.pyin(
            y,
            fmin=F0_MIN_HZ,
            fmax=F0_MAX_HZ,
            sr=sr,
        )

        contour = [
            round(float(v), 2) if (voiced_flag[i] and not np.isnan(v)) else 0.0
            for i, v in enumerate(f0)
        ]

        return contour

    except Exception as e:
        logger.warning(
            "Pitch extraction failed for segment [%.2f-%.2f]: %s", start, end, e
        )
        return []


def run_pitch_extraction_background(
    audio_path: str,
    script: List[SceneLine],
    scene_id: str,
) -> None:
    """
    Spawn a background thread to extract pitch for all lines.
    - Immediately marks scene as 'processing' in Redis.
    - Stores completed results in Redis when done.
    - Cleans up audio file after extraction.
    Non-blocking — caller returns immediately.
    """
    # Mark as processing BEFORE spawning thread
    # so the frontend can poll immediately and get 202
    mark_pitch_processing(scene_id)

    thread = threading.Thread(
        target=_extract_all_lines,
        args=(audio_path, script, scene_id),
        daemon=True,
    )
    thread.start()
    print(f"🎵 Pitch extraction started in background for {len(script)} lines.")


# ─────────────────────────────────────────────────────────────────────────────
# Internal
# ─────────────────────────────────────────────────────────────────────────────


def _extract_all_lines(
    audio_path: str,
    script: List[SceneLine],
    scene_id: str,
) -> None:
    """
    Extract pitch for every line, store in Redis, clean up audio.
    Silently stores [] on per-line failure — never raises.
    """
    print(f"🎵 Background pitch extraction running for {len(script)} lines...")

    pitch_data = []

    try:
        for line in script:
            contour = extract_pitch_for_line(audio_path, line.startTime, line.endTime)
            result = contour if contour else []

            # Update SceneLine in-place (for any in-memory references)
            line.pitchPattern = result

            # Build payload for Redis
            pitch_data.append(
                {
                    "lineId": line.id,
                    "pitchPattern": result,
                }
            )

        # Store completed results in Redis
        store_pitch_result(scene_id, pitch_data)
        print("✅ Background pitch extraction complete.")

    except Exception as e:
        logger.warning("Unexpected error during pitch extraction: %s", e)

    finally:
        # Always clean up audio file
        try:
            if os.path.exists(audio_path):
                os.unlink(audio_path)
                print(f"🗑️  Audio file cleaned up: {audio_path}")
        except Exception as e:
            logger.warning("Failed to clean up audio file %s: %s", audio_path, e)
