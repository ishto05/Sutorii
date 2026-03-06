"""
services/subtitles.py
─────────────────────────────────────────────────────────────────────────────
Attempts to fetch subtitles from a YouTube URL using yt-dlp.
Returns parsed segments compatible with the Whisper segment format,
so the rest of the pipeline (GPT refinement) works unchanged.

Priority order:
    1. Manual subtitles  (most accurate)
    2. Auto-generated    (YouTube ASR — faster than Whisper, noisier)
    3. None              (caller falls back to Whisper)
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import os
import re
import tempfile
from typing import Optional

import yt_dlp

logger = logging.getLogger(__name__)

# Languages to look for, in priority order
PREFERRED_LANGS = ["ja", "en"]


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────


def fetch_subtitle_segments(youtube_url: str) -> Optional[dict]:
    """
    Try to fetch subtitles for a YouTube URL.

    Returns a Whisper-compatible dict:
        {
            "text": "...",
            "segments": [...],
            "language": "ja",
            "duration": 0.0,
            "source": "subtitles_manual" | "subtitles_auto"
        }

    Returns None if no subtitles are available.
    """
    with tempfile.TemporaryDirectory() as tmp_dir:
        # try:
        # ── 1. Try manual subtitles first ────────────────────────────────────
        result = _try_fetch(
            youtube_url=youtube_url,
            tmp_dir=tmp_dir,
            auto=False,
        )
        if result:
            logger.info("✅ [SUBTITLES] Manual subtitles found.")
            return result

        # ── 2. Fall back to auto-generated subtitles ─────────────────────────
        result = _try_fetch(
            youtube_url=youtube_url,
            tmp_dir=tmp_dir,
            auto=True,
        )
        if result:
            logger.info("✅ [SUBTITLES] Auto-generated subtitles found.")
            return result

        logger.info(
            "⚠️  [SUBTITLES] No subtitles available — caller should use Whisper."
        )
        return None
    # except Exception as e:
    #     if "429" in str(e):
    #         logger.warning(
    #             "⚠️  [SUBTITLES] YouTube rate limited — falling back to Whisper."
    #         )
    #     else:
    #         logger.warning("yt-dlp subtitle fetch failed: %s", e)
    #     return None


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────


def _try_fetch(youtube_url: str, tmp_dir: str, auto: bool) -> Optional[dict]:
    """
    Attempt to download subtitles (manual or auto) using yt-dlp.
    Returns parsed segment dict or None.
    """
    ydl_opts = {
        "skip_download": True,
        "writesubtitles": not auto,
        "writeautomaticsub": auto,
        "subtitleslangs": PREFERRED_LANGS,
        "subtitlesformat": "srt",
        "outtmpl": os.path.join(tmp_dir, "subtitle.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
    except Exception as e:
        if "429" in str(e):
            logger.warning(
                "⚠️  [SUBTITLES] YouTube rate limited — falling back to Whisper."
            )
        else:
            logger.warning("yt-dlp subtitle fetch failed: %s", e)
        return None

    # Find the downloaded .srt file
    srt_path = _find_srt(tmp_dir)
    if not srt_path:
        return None

    # Detect language from filename (e.g. subtitle.ja.srt)
    detected_lang = _detect_lang_from_filename(srt_path)

    # Parse the SRT into segments
    segments = _parse_srt(srt_path)
    if not segments:
        return None

    full_text = " ".join(s["text"] for s in segments).strip()
    duration = segments[-1]["end"] if segments else 0.0
    source = "subtitles_auto" if auto else "subtitles_manual"

    return {
        "text": full_text,
        "segments": segments,
        "language": detected_lang or "ja",
        "duration": duration,
        "source": source,
    }


def _find_srt(directory: str) -> Optional[str]:
    """Find the first .srt file in the directory, preferring 'ja'."""
    files = os.listdir(directory)
    srt_files = [f for f in files if f.endswith(".srt")]

    if not srt_files:
        return None

    # Prefer Japanese subtitle file
    for lang in PREFERRED_LANGS:
        for f in srt_files:
            if f".{lang}." in f:
                return os.path.join(directory, f)

    # Return first available
    return os.path.join(directory, srt_files[0])


def _detect_lang_from_filename(path: str) -> Optional[str]:
    """
    Extract language code from filename like 'subtitle.ja.srt'.
    Returns e.g. 'ja', 'en', or None.
    """
    basename = os.path.basename(path)
    match = re.search(r"\.([a-z]{2})\.srt$", basename)
    return match.group(1) if match else None


def _parse_srt(file_path: str) -> list:
    """
    Parse an SRT file into Whisper-compatible segment dicts.
    No external dependencies — uses stdlib only.

    SRT block format:
        1
        00:00:02,000 --> 00:00:04,000
        元気ですか？
    """
    segments = []

    try:
        with open(file_path, "r", encoding="utf-8-sig") as f:
            content = f.read()
    except UnicodeDecodeError:
        # Some SRT files use different encoding
        with open(file_path, "r", encoding="latin-1") as f:
            content = f.read()

    # Split into blocks by double newline
    blocks = re.split(r"\n\n+", content.strip())

    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue

        # Line 0: index (ignore)
        # Line 1: timestamps
        # Line 2+: text

        timestamp_line = lines[1]
        text_lines = lines[2:]

        start, end = _parse_timestamp_line(timestamp_line)
        if start is None:
            continue

        # Join multi-line subtitles, strip HTML tags (e.g. <i>...</i>)
        raw_text = " ".join(text_lines)
        clean_text = re.sub(r"<[^>]+>", "", raw_text).strip()

        if not clean_text:
            continue

        segments.append(
            {
                "speaker": "SPEAKER_00",  # unknown at this stage
                "text": clean_text,
                "start": start,
                "end": end,
                "words": [],  # no word-level timing from SRT
            }
        )

    return segments


def _parse_timestamp_line(line: str):
    """
    Parse '00:00:02,000 --> 00:00:04,000' into (start_seconds, end_seconds).
    Returns (None, None) on failure.
    """
    pattern = (
        r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})"
    )
    match = re.match(pattern, line.strip())
    if not match:
        return None, None

    h1, m1, s1, ms1, h2, m2, s2, ms2 = match.groups()

    start = int(h1) * 3600 + int(m1) * 60 + int(s1) + int(ms1) / 1000
    end = int(h2) * 3600 + int(m2) * 60 + int(s2) + int(ms2) / 1000

    return round(start, 3), round(end, 3)
