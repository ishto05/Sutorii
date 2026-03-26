import yt_dlp
import tempfile
import uuid
import os
from app.services.whisper import transcribe
from app.services.subtitles import fetch_subtitle_segments
from app.services.gpt import refine_script_from_whisper, GPTSceneLine, GPTWord
from app.services.storage import upload_audio
from app.services.pitch import run_pitch_extraction_background
from app.services.characterID_client import (
    is_characterid_service_configured,
    relabel_segments_with_characters,
)
from app.models.schema import ScenePackage, SceneLine, QuizQuestion, WordToken
from datetime import datetime
from typing import List, Optional


MIN_LINE_DURATION = 0.3  # seconds


# ─────────────────────────────────────────────────────────────────────────────
# Preview — fast metadata only, no audio download
# ─────────────────────────────────────────────────────────────────────────────

def preview_scene(youtube_url: str) -> dict:
    """
    Fetch video metadata from YouTube using yt-dlp without downloading anything.
    Returns: { title, thumbnail_url, detected_language, duration }

    Called by POST /ingest { phase: "preview" }.
    Frontend uses this to show the confirmation card before full ingest.
    """
    print(f"🔍 Fetching preview for: {youtube_url}")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
    except Exception as e:
        raise RuntimeError(f"Failed to fetch video metadata: {str(e)}")

    if not info:
        raise RuntimeError("yt-dlp returned no metadata for this URL")

    # Language detection priority:
    # 1. yt-dlp 'language' field — most reliable when present (set by uploader)
    # 2. spoken_language field — set by YouTube for some videos
    # 3. Default to None — frontend will show unknown, WhisperX will detect it
    detected_language = (
        _normalize_lang_code(info.get("language"))
        or _normalize_lang_code(info.get("spoken_language"))
    )

    # If metadata is missing, try guessing from subtitles/auto-captions
    if not detected_language:
        # Check manual subtitles first
        subs = info.get("subtitles") or {}
        # If there's only one or two, maybe we can guess.
        # But for now, let's keep it simple or look for "en" as a safe fallback for Netflix-like videos
        if "en" in subs:
            detected_language = "en"
        elif "ko" in subs:
            detected_language = "ko"
        elif "ja" in subs:
            detected_language = "ja"

    title = info.get("title") or info.get("fulltitle") or "Untitled"
    thumbnail = _best_thumbnail(info)
    duration = float(info.get("duration") or 0.0)

    print(f"   ✅ Preview: '{title}' | lang={detected_language} | {duration}s")

    return {
        "title": title,
        "thumbnail_url": thumbnail,
        "detected_language": detected_language or "unknown",
        "duration": duration,
    }


def _normalize_lang_code(raw: Optional[str]) -> Optional[str]:
    """
    Normalize a language value to a clean ISO 639-1 code.

    Handles:
    - None / empty → None
    - Already clean ISO codes: "ja", "en", "ko" → as-is
    - Full language names from OpenAI Whisper: "japanese" → "ja"
    - Variant codes: "zh-TW", "en-US" → "zh", "en"
    - Unknown values → None
    """
    if not raw:
        return None

    val = raw.strip().lower()

    # Map full language names (OpenAI Whisper returns these)
    WHISPER_NAME_TO_ISO = {
        "afrikaans": "af", "arabic": "ar", "armenian": "hy",
        "azerbaijani": "az", "belarusian": "be", "bosnian": "bs",
        "bulgarian": "bg", "catalan": "ca", "chinese": "zh",
        "croatian": "hr", "czech": "cs", "danish": "da",
        "dutch": "nl", "english": "en", "estonian": "et",
        "finnish": "fi", "french": "fr", "galician": "gl",
        "german": "de", "greek": "el", "hebrew": "he",
        "hindi": "hi", "hungarian": "hu", "icelandic": "is",
        "indonesian": "id", "italian": "it", "japanese": "ja",
        "kannada": "kn", "kazakh": "kk", "korean": "ko",
        "latvian": "lv", "lithuanian": "lt", "macedonian": "mk",
        "malay": "ms", "marathi": "mr", "maori": "mi",
        "nepali": "ne", "norwegian": "no", "persian": "fa",
        "polish": "pl", "portuguese": "pt", "romanian": "ro",
        "russian": "ru", "serbian": "sr", "slovak": "sk",
        "slovenian": "sl", "spanish": "es", "swahili": "sw",
        "swedish": "sv", "tagalog": "tl", "tamil": "ta",
        "thai": "th", "turkish": "tr", "ukrainian": "uk",
        "urdu": "ur", "vietnamese": "vi", "welsh": "cy",
    }

    if val in WHISPER_NAME_TO_ISO:
        return WHISPER_NAME_TO_ISO[val]

    # Strip variant suffix: "en-US" → "en", "zh-TW" → "zh"
    base = val.split("-")[0].split("_")[0]

    # Validate it looks like an ISO 639-1 code (2-3 lowercase letters)
    if base.isalpha() and 2 <= len(base) <= 3:
        return base

    return None


def _best_thumbnail(info: dict) -> str:
    """
    Return the best available thumbnail URL from yt-dlp info.
    Prefers largest resolution. Falls back to 'thumbnail' field.
    """
    thumbnails = info.get("thumbnails") or []
    if thumbnails:
        # yt-dlp orders thumbnails — last is usually highest resolution
        # Filter to those with a URL
        valid = [t for t in thumbnails if t.get("url")]
        if valid:
            return valid[-1]["url"]

    return info.get("thumbnail") or ""


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
                transliteration=line.transliteration,
                translation=line.translation,
                words=[
                    WordToken(
                        word=w.word,
                        reading=w.reading,
                        meaning=w.meaning,
                    )
                    for w in (line.words or [])
                ],
                startTime=round(start, 3),
                endTime=round(end, 3),
            )
        )
        prev_end = end

    return normalized


def ingest_scene(
    youtube_url: str,
    user_title: Optional[str] = None,
    translation_language: str = "English",
    native_language: str = "en",
    transliteration_enabled: bool = True,
    detected_language: Optional[str] = None,
) -> ScenePackage:
    if detected_language == "auto":
        detected_language = None
    """
    Full 7-phase ingestion pipeline:
    1. Check for subtitles
    2. Download audio (yt-dlp)
    3. Transcribe (Whisper) or use subtitles
    4. Refine script + Quiz (GPT)
    5. Store audio (Supabase)
    6. Package results
    7. Kick off pitch extraction (background)
    """
    print(f"🚀 Starting ingestion for: {youtube_url}")

    tmp_audio = tempfile.NamedTemporaryFile(delete=False)
    tmp_base_path = tmp_audio.name
    tmp_audio.close()

    final_mp3_path = f"{tmp_base_path}.mp3"
    audio_ready_for_pitch: bool = False
    yt_title: Optional[str] = None
    yt_duration: Optional[float] = None

    try:
        # ── Phase 1: Check for subtitles ─────────────────────────────────────
        print(" Phase 1: Checking for subtitles...")
        # Pass detected_language as a priority for subtitle selection
        subtitle_transcript = fetch_subtitle_segments(youtube_url, preferred_language=detected_language)

        # ── Phase 2: Always download audio + capture metadata ─────────────────
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
                info = ydl.extract_info(youtube_url, download=True)
                # Capture metadata for character ID + duration fix
                if info:
                    raw_title = info.get("title") or info.get("fulltitle")
                    yt_title = str(raw_title).strip() if raw_title else None
                    yt_duration = float(info.get("duration") or 0.0)
                    
                    # If we didn't have a detected_language from frontend, try getting it now
                    if not detected_language:
                        detected_language = _normalize_lang_code(info.get("language") or info.get("spoken_language"))
                    
                    print(f"   📋 yt-dlp title: {yt_title}")
                    print(f"   ⏱️  yt-dlp duration: {yt_duration}s")
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
            transcript_source = subtitle_transcript["source"]
        else:
            print(" Phase 3: No subtitles — transcribing via Whisper...")
            try:
                # Use detected_language if available to help Whisper
                transcript = transcribe(final_mp3_path, language=detected_language)
                transcript_source = transcript.get("source", "openai_whisper")
            except Exception as e:
                print(f"❌ Whisper phase failed: {e}")
                raise RuntimeError(f"Transcription failed: {str(e)}")

        # ── Duration: use yt-dlp value as fallback if Whisper returns 0 ───────
        transcript_duration = transcript.get("duration") or 0.0
        if transcript_duration == 0.0 and yt_duration and yt_duration > 0:
            print(f"   ⚠️  Whisper returned duration=0, using yt-dlp duration: {yt_duration}s")
            transcript_duration = yt_duration

        # ── Normalize language code — Whisper may return full name e.g. "japanese" ──
        raw_lang = transcript.get("language") or ""
        transcript["language"] = _normalize_lang_code(raw_lang) or "unknown"
        print(f"   🌐 Detected language: {transcript['language']} (raw: '{raw_lang}')")

        # ── Duration guard ────────────────────────────────────────────────────
        if transcript_duration > 600:
            raise ValueError("Video too long for MVP (max 10 minutes)")

        # ── Phase 3b: Character ID — relabel SPEAKER_XX → named characters ───
        print(" Phase 3b: Running character identification...")
        if is_characterid_service_configured():
            try:
                relabeled = relabel_segments_with_characters(
                    youtube_url=youtube_url,
                    segments=transcript.get("segments", []),
                    yt_title=yt_title,
                    user_title=user_title,
                )
                # Replace segments in transcript with relabeled ones
                transcript["segments"] = relabeled["segments"]
                print(
                    f"   ✅ Character ID complete. "
                    f"Character map: {relabeled.get('character_map', {})}"
                )
            except Exception as e:
                print(
                    f"   ⚠️  Character ID failed ({e}) — continuing with SPEAKER_XX labels."
                )
        else:
            print("   ⚠️  Character ID service not configured — skipping Phase 3b.")

        # ── Phase 4: GPT Refinement + Quiz Generation ─────────────────────────
        print(" Phase 4: Refining script + generating quiz via GPT...")
        try:
            gpt_response = refine_script_from_whisper(
                transcript,
                translation_language=translation_language,
                native_language=native_language,
                transliteration_enabled=transliteration_enabled,
            )
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
                "title": yt_title,
                "transcriptSource": transcript_source,
            },
            audio={
                "storagePath": storage_path,
                "duration": transcript_duration,
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
                scene_id=scene_id,
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