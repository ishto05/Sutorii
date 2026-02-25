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
    """
    if not gpt_lines:
        return []

    ordered = sorted(gpt_lines, key=lambda l: l.startTime)
    normalized: List[SceneLine] = []
    prev_end = 0.0

    for i, line in enumerate(ordered, start=1):
        start = max(line.startTime, prev_end)
        end = line.endTime

        if end - start < MIN_LINE_DURATION:
            end = start + MIN_LINE_DURATION

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
    print(f"🚀 Starting ingestion for: {youtube_url}")

    tmp_audio = tempfile.NamedTemporaryFile(delete=False)
    tmp_base_path = tmp_audio.name
    tmp_audio.close()

    final_mp3_path = f"{tmp_base_path}.mp3"

    try:
        # 1. Download & Extract Audio
        print("📥 Phase 1: Downloading audio via yt-dlp...")
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
            "nocheckcertificate": True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([youtube_url])
        except Exception as e:
            print(f"❌ yt-dlp failed: {e}")
            raise RuntimeError(f"Failed to download video: {str(e)}")

        if not os.path.exists(final_mp3_path):
            # Try to see if it downloaded with a different extension or failed post-processing
            print(
                f"⚠️  Expected MP3 not found at {final_mp3_path}. Checking for alternatives..."
            )
            possible_files = [
                f"{tmp_base_path}.m4a",
                f"{tmp_base_path}.webm",
                f"{tmp_base_path}.wav",
            ]
            found = False
            for pf in possible_files:
                if os.path.exists(pf):
                    final_mp3_path = pf
                    found = True
                    print(f"✅ Found alternative: {pf}")
                    break
            if not found:
                raise FileNotFoundError(
                    "Could not find downloaded audio file in any supported format."
                )

        # 2. Transcribe
        print("🎙️ Phase 2: Transcribing via Whisper...")
        try:
            transcript = transcribe(final_mp3_path)
        except Exception as e:
            print(f"❌ Whisper phase failed: {e}")
            raise RuntimeError(f"Transcription failed: {str(e)}")

        if transcript.get("duration", 0) > 600:
            raise ValueError("Video too long for MVP (max 10 minutes)")

        # 3. GPT Refinement
        print("🧠 Phase 3: Refining script via GPT...")
        try:
            gpt_lines = refine_script_from_whisper(transcript)
        except Exception as e:
            print(f"❌ GPT phase failed: {e}")
            raise RuntimeError(f"Script generation failed: {str(e)}")

        # 4. Storage Upload
        print("☁️ Phase 4: Uploading to Supabase...")
        try:
            storage_path = upload_audio(final_mp3_path)
        except Exception as e:
            print(f"❌ Storage phase failed: {e}")
            raise RuntimeError(f"Audio upload failed: {str(e)}")

        # 5. Assemble and Return
        print("✅ Phase 5: Normalizing and assembling package...")
        script = normalize_scene_lines(gpt_lines)

        scene = ScenePackage(
            sceneId=str(uuid.uuid4()),
            language="ja",
            source={"type": "youtube", "url": youtube_url},
            audio={
                "storagePath": storage_path,
                "duration": transcript.get("duration", 0),
                "sampleRate": 16000,
            },
            script=script,
            metadata={
                "createdAt": datetime.utcnow().isoformat(),
                "version": "v1",
            },
        )

        print(f"✨ Ingestion complete: {scene.sceneId}")
        return scene

    except Exception as e:
        print(f"💥 Pipeline Error: {e}")
        raise e

    finally:
        # Cleanup
        for path in [
            final_mp3_path,
            tmp_base_path,
            f"{tmp_base_path}.m4a",
            f"{tmp_base_path}.webm",
            f"{tmp_base_path}.wav",
        ]:
            if os.path.exists(path):
                try:
                    os.unlink(path)
                except:
                    pass
