import yt_dlp
import tempfile
import uuid
import os
from app.services.whisper import transcribe
from app.services.gpt import refine_script_from_whisper
from app.services.storage import upload_audio
from app.models.schema import ScenePackage, SceneLine
from datetime import datetime
from typing import List
from app.services.gpt import GPTSceneLine
from app.models.schema import SceneLine

MIN_LINE_DURATION = 0.3  # seconds


def normalize_scene_lines(gpt_lines: List[GPTSceneLine]) -> List[SceneLine]:
    """
    Normalize GPT-produced dialogue lines into safe, monotonic SceneLine objects.

    Rules:
    1. Sort by startTime
    2. Prevent overlaps (clamp startTime to previous endTime)
    3. Enforce minimum duration
    4. Ensure startTime < endTime
    """

    if not gpt_lines:
        return []

    # 1) Sort by startTime (stable, deterministic)
    ordered = sorted(gpt_lines, key=lambda l: l.startTime)

    normalized: List[SceneLine] = []
    prev_end = 0.0

    for i, line in enumerate(ordered, start=1):
        start = max(line.startTime, prev_end)
        end = line.endTime

        # 2) Enforce minimum duration
        if end - start < MIN_LINE_DURATION:
            end = start + MIN_LINE_DURATION

        # 3) Final guard
        if start >= end:
            end = start + MIN_LINE_DURATION

        normalized.append(
            SceneLine(
                id=f"line-{i}",
                speaker=line.speaker,
                text=line.text,
                startTime=round(start, 3),
                endTime=round(end, 3),
            )
        )

        prev_end = end

    return normalized


def ingest_scene(youtube_url: str) -> ScenePackage:
    tmp_audio = tempfile.NamedTemporaryFile(delete=False)
    tmp_base_path = tmp_audio.name
    tmp_audio.close()

    final_mp3_path = f"{tmp_base_path}.mp3"

    try:
        ydl_opts = {
            "format": "bestaudio/best",
            "noplaylist": True,
            "outtmpl": f"{tmp_base_path}.%(ext)s",
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "128",
                }
            ],
            "quiet": True,
            "no_warnings": True,
            "source_address": "0.0.0.0",
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])

        if not os.path.exists(final_mp3_path):
            raise FileNotFoundError(f"Audio file not created: {final_mp3_path}")

        # ✅ Whisper supports MP3
        transcript = transcribe(final_mp3_path)

        if transcript["duration"] > 600:
            raise ValueError("Video too long for MVP (max 10 minutes)")

        try:
            gpt_lines = refine_script_from_whisper(transcript)
        except Exception as e:
            print("GPT structured output failed:", e)
            raise RuntimeError("Script generation failed")

        # ✅ Upload MP3 (small, safe)
        storage_path = upload_audio(final_mp3_path)

        script = normalize_scene_lines(gpt_lines)

        scene = ScenePackage(
            sceneId=str(uuid.uuid4()),
            language="ja",
            source={"type": "youtube", "url": youtube_url},
            audio={
                "storagePath": storage_path,
                "duration": transcript["duration"],
                "sampleRate": 16000,
            },
            script=script,
            metadata={
                "createdAt": datetime.utcnow().isoformat(),
                "version": "v1",
            },
        )

        return scene

    finally:
        if os.path.exists(final_mp3_path):
            os.unlink(final_mp3_path)
        if os.path.exists(tmp_base_path):
            os.unlink(tmp_base_path)
