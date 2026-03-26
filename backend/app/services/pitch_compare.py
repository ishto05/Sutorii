"""
services/pitch_compare.py
─────────────────────────────────────────────────────────────────────────────
Compares user pitch contour against native reference using Dynamic Time Warping.

DTW handles different speaking speeds naturally — a slow speaker and a fast
speaker saying the same line will still produce a meaningful similarity score.

Returns:
    - pitch_score: 0-100 (100 = perfect match)
    - pitch_feedback: "good" | "flat" | "rising" | "falling" | "unavailable"
─────────────────────────────────────────────────────────────────────────────
"""

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

F0_MIN_HZ = 70
F0_MAX_HZ = 400
SAMPLE_RATE = 16000

# DTW distance considered "perfect" (score=100) → 0
# DTW distance considered "worst" (score=0) → this value
MAX_DTW_DISTANCE = 150.0

# Minimum voiced frames needed for meaningful comparison
MIN_VOICED_FRAMES = 5


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def compare_pitch(
    audio_path: str,
    native_pitch: Optional[list],
    start: float = 0.0,
    end: float = 0.0,
) -> dict:
    """
    Compare user audio pitch against stored native pitch contour.

    Args:
        audio_path:   Path to user's recorded audio
        native_pitch: List of Hz floats from SceneLine.pitchPattern
                      (0.0 = unvoiced frame)
        start:        Line start time in audio (for slicing if full recording)
        end:          Line end time in audio

    Returns:
        {
            "pitch_score":    float,   # 0-100, -1.0 if unavailable
            "pitch_feedback": str,     # "good"|"flat"|"rising"|"falling"|"unavailable"
        }

    Never raises.
    """
    if not native_pitch or len(native_pitch) == 0:
        return {"pitch_score": -1.0, "pitch_feedback": "unavailable"}

    try:
        user_pitch = _extract_pitch(audio_path, start, end)

        if user_pitch is None or len(user_pitch) == 0:
            return {"pitch_score": -1.0, "pitch_feedback": "unavailable"}

        native_arr = _clean_pitch(np.array(native_pitch, dtype=float))
        user_arr = _clean_pitch(np.array(user_pitch, dtype=float))

        if len(native_arr) < MIN_VOICED_FRAMES or len(user_arr) < MIN_VOICED_FRAMES:
            return {"pitch_score": -1.0, "pitch_feedback": "unavailable"}

        # Normalize both to mean=0 so absolute pitch level doesn't penalize
        # (people have different voice ranges — we compare shape, not absolute Hz)
        native_norm = _normalize(native_arr)
        user_norm = _normalize(user_arr)

        distance = _dtw_distance(native_norm, user_norm)
        score = max(0.0, 100.0 - (distance / MAX_DTW_DISTANCE * 100.0))
        score = round(min(score, 100.0), 1)

        feedback = _pitch_feedback(user_arr, native_arr, score)

        logger.debug("[Pitch] DTW distance=%.2f → score=%.1f feedback=%s",
                     distance, score, feedback)

        return {"pitch_score": score, "pitch_feedback": feedback}

    except Exception as e:
        logger.warning("[Pitch] Comparison failed: %s", e)
        return {"pitch_score": -1.0, "pitch_feedback": "unavailable"}


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_pitch(audio_path: str, start: float, end: float) -> Optional[np.ndarray]:
    """Extract F0 pitch contour from audio file using librosa pyin."""
    try:
        import librosa

        duration = max(end - start, 0.1) if end > start else None
        offset = start if start > 0 else 0.0

        y, sr = librosa.load(
            audio_path,
            sr=SAMPLE_RATE,
            offset=offset,
            duration=duration,
            mono=True,
        )

        if len(y) == 0:
            return None

        f0, voiced_flag, _ = librosa.pyin(
            y,
            fmin=F0_MIN_HZ,
            fmax=F0_MAX_HZ,
            sr=sr,
        )

        # Replace unvoiced/NaN frames with 0.0
        contour = np.array([
            float(v) if (voiced_flag[i] and not np.isnan(v)) else 0.0
            for i, v in enumerate(f0)
        ])
        return contour

    except Exception as e:
        logger.warning("[Pitch] Extraction failed: %s", e)
        return None


def _clean_pitch(arr: np.ndarray) -> np.ndarray:
    """Remove unvoiced (0.0) frames, keeping only voiced pitch values."""
    return arr[arr > 0.0]


def _normalize(arr: np.ndarray) -> np.ndarray:
    """Zero-mean normalize pitch array. Handles edge cases."""
    if len(arr) == 0:
        return arr
    mean = np.mean(arr)
    std = np.std(arr)
    if std < 1e-6:
        return arr - mean   # flat pitch — just center it
    return (arr - mean) / std


def _dtw_distance(seq_a: np.ndarray, seq_b: np.ndarray) -> float:
    """
    Compute DTW distance between two 1D sequences.
    Uses standard DP implementation — O(n*m) time.
    For short pitch contours (< 500 frames each) this is fast enough.
    """
    n, m = len(seq_a), len(seq_b)
    if n == 0 or m == 0:
        return MAX_DTW_DISTANCE

    # Initialize cost matrix
    dtw = np.full((n + 1, m + 1), np.inf)
    dtw[0, 0] = 0.0

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = abs(float(seq_a[i - 1]) - float(seq_b[j - 1]))
            dtw[i, j] = cost + min(
                dtw[i - 1, j],      # insertion
                dtw[i, j - 1],      # deletion
                dtw[i - 1, j - 1],  # match
            )

    # Normalize by path length to make comparable across different lengths
    path_length = n + m
    return float(dtw[n, m]) / max(path_length, 1)


def _pitch_feedback(
    user_pitch: np.ndarray,
    native_pitch: np.ndarray,
    score: float,
) -> str:
    """
    Generate qualitative pitch feedback.

    Categories:
        good      — score ≥ 70, pitch shape matches well
        flat      — user pitch has low variance (monotone)
        rising    — user pitch trends upward vs native downward
        falling   — user pitch trends downward vs native upward
    """
    if score >= 70:
        return "good"

    # Check if user pitch is flat (low standard deviation)
    user_std = float(np.std(user_pitch)) if len(user_pitch) > 0 else 0.0
    native_std = float(np.std(native_pitch)) if len(native_pitch) > 0 else 0.0

    if user_std < native_std * 0.4:
        return "flat"

    # Compare trends: slope of first half vs second half
    def _trend(arr: np.ndarray) -> float:
        if len(arr) < 4:
            return 0.0
        mid = len(arr) // 2
        return float(np.mean(arr[mid:])) - float(np.mean(arr[:mid]))

    user_trend = _trend(user_pitch)
    native_trend = _trend(native_pitch)

    # If trends are in opposite directions — give directional feedback
    if native_trend < -5 and user_trend > 5:
        return "rising"
    if native_trend > 5 and user_trend < -5:
        return "falling"

    return "flat"