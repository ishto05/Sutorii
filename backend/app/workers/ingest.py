import yt_dlp
import tempfile
import uuid
import os
from app.services.whisper import transcribe
from app.services.subtitles import fetch_subtitle_segments
from app.services.gpt import refine_script_from_whisper, GPTSceneLine
from app.services.storage import upload_audio
from app.services.pitch import run_pitch_extraction_background
from app.models.schema import ScenePackage, SceneLine, QuizQuestion
from datetime import datetime
from typing import List


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
                characterName=line.characterName,
                text=line.text,
                phoneticReading=line.phoneticReading,
                translation=line.translation,
                words=line.words,
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
    audio_ready_for_pitch: bool = False

    try:
        # ── Phase 1: Check for subtitles ─────────────────────────────────────
        print(" Phase 1: Checking for subtitles...")
        subtitle_transcript = fetch_subtitle_segments(youtube_url)

        # ── Phase 2: Always download audio ───────────────────────────────────
        print(" Phase 2: Downloading audio via yt-dlp...")
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

        audio_ready_for_pitch = True

        # ── Phase 3: Transcription (skip if subtitles exist) ─────────────────
        if subtitle_transcript:
            print(
                f" ✅ Using subtitles (source: {subtitle_transcript['source']}) — skipping Whisper."
            )
            transcript = subtitle_transcript
        else:
            print(" Phase 3: No subtitles — transcribing via Whisper...")
            try:
                transcript = transcribe(final_mp3_path)
            except Exception as e:
                print(f"❌ Whisper phase failed: {e}")
                raise RuntimeError(f"Transcription failed: {str(e)}")

        # ── Duration guard ────────────────────────────────────────────────────
        if transcript.get("duration", 0) > 600:
            raise ValueError("Video too long for MVP (max 10 minutes)")

        # ── Phase 4: GPT Refinement + Quiz Generation ─────────────────────────
        print(" Phase 4: Refining script + generating quiz via GPT...")
        try:
            gpt_response = refine_script_from_whisper(transcript)
        except Exception as e:
            print(f"❌ GPT phase failed: {e}")
            raise RuntimeError(f"Script generation failed: {str(e)}")

        # ── Phase 5: Storage Upload ───────────────────────────────────────────
        print(" Phase 5: Uploading to Supabase...")
        try:
            storage_path = upload_audio(final_mp3_path)
        except Exception as e:
            print(f"❌ Storage phase failed: {e}")
            raise RuntimeError(f"Audio upload failed: {str(e)}")

        # ── Phase 6: Assemble ScenePackage ────────────────────────────────────
        print(" Phase 6: Normalizing and assembling package...")
        script = normalize_scene_lines(gpt_response.lines)

        quiz = [
            QuizQuestion(
                questionId=f"quiz-{i+1}",
                type=q.type,
                question=q.question,
                expectedAnswer=q.expectedAnswer,
                targetLanguage=transcript.get("language", "ja"),
                relatedLineId=q.relatedLineId,
            )
            for i, q in enumerate(gpt_response.quiz)
        ]

        scene_id = str(uuid.uuid4())

        scene = ScenePackage(
            sceneId=scene_id,
            language=transcript.get("language", "ja"),
            sourceLanguage=transcript.get("language", "ja"),
            uniqueCharacters=gpt_response.characters,
            source={
                "type": "youtube",
                "url": youtube_url,
                "transcriptSource": transcript.get("source", "unknown"),
            },
            audio={
                "storagePath": storage_path,
                "duration": transcript.get("duration", 0),
                "sampleRate": 16000,
            },
            script=script,
            quiz=quiz,
            metadata={
                "createdAt": datetime.utcnow().isoformat(),
                "version": "v1",
            },
        )

        # ── Phase 7: Pitch Extraction (background, non-blocking) ──────────────
        if audio_ready_for_pitch:
            print(" Phase 7: Spawning background pitch extraction...")
            run_pitch_extraction_background(
                audio_path=final_mp3_path,
                script=scene.script,
                scene_id=scene_id,  # ← passed so Redis key matches sceneId
            )
        else:
            print(" Phase 7: Skipping pitch extraction (no local audio).")

        print(
            f" Ingestion complete: {scene.sceneId} | lines: {len(script)} | quiz: {len(quiz)} questions"
        )
        return scene

    except Exception as e:
        print(f"💥 Pipeline Error: {e}")
        raise e

    finally:
        # final_mp3_path excluded — pitch.py owns its cleanup
        for path in [
            tmp_base_path,
            f"{tmp_base_path}.m4a",
            f"{tmp_base_path}.webm",
            f"{tmp_base_path}.wav",
        ]:
            if os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception:
                    pass
