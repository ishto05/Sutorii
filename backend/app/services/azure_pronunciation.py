"""
services/azure_pronunciation.py
─────────────────────────────────────────────────────────────────────────────
Wrapper for Azure Cognitive Services Pronunciation Assessment.

Env vars required (via settings):
    AZURE_SPEECH_KEY     — Azure Speech resource key
    AZURE_SPEECH_REGION  — Azure region e.g. "eastus"

Graceful degradation:
    - No credentials → returns mock scores (dev mode)
    - SDK not installed → returns mock scores
    - Azure call fails → returns zeroed scores, never raises
─────────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import os
import tempfile
from typing import Optional

from app.config.config import settings

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Locale map: ISO 639-1 → Azure BCP-47
# ─────────────────────────────────────────────────────────────────────────────

LOCALE_MAP = {
    "ja": "ja-JP", "en": "en-US", "ko": "ko-KR",
    "zh": "zh-CN", "fr": "fr-FR", "de": "de-DE",
    "es": "es-ES", "pt": "pt-BR", "it": "it-IT",
    "ru": "ru-RU", "ar": "ar-SA", "hi": "hi-IN",
    "th": "th-TH", "vi": "vi-VN", "id": "id-ID",
    "nl": "nl-NL", "pl": "pl-PL", "tr": "tr-TR",
    "sv": "sv-SE", "da": "da-DK", "fi": "fi-FI",
    "no": "nb-NO", "cs": "cs-CZ", "ro": "ro-RO",
    "hu": "hu-HU", "uk": "uk-UA", "el": "el-GR",
    "he": "he-IL",
}


def get_locale(language_code: str) -> str:
    """
    Map ISO 639-1 code to Azure BCP-47 locale.
    Falls back to en-US for unknown, empty, or unrecognized codes.
    Azure requires a valid locale — never pass "unknown" directly to it.
    """
    if not language_code or language_code.lower() in ("unknown", ""):
        return "en-US"
    return LOCALE_MAP.get(language_code.lower(), "en-US")


def is_azure_configured() -> bool:
    return bool(settings.AZURE_SPEECH_KEY and settings.AZURE_SPEECH_REGION)


# ─────────────────────────────────────────────────────────────────────────────
# Result helpers
# ─────────────────────────────────────────────────────────────────────────────

def _empty_result(source: str = "unavailable") -> dict:
    return {
        "pronunciation_score": 0.0,
        "fluency_score": 0.0,
        "completeness_score": 0.0,
        "words": [],
        "source": source,
    }


def _mock_result(expected_text: str) -> dict:
    """Plausible mock for development without Azure credentials."""
    words = []
    for word in expected_text.split():
        words.append({
            "word": word,
            "accuracy_score": 75.0,
            "phonemes": [],
        })
    return {
        "pronunciation_score": 75.0,
        "fluency_score": 80.0,
        "completeness_score": 90.0,
        "words": words,
        "source": "mock",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Core Azure call
# ─────────────────────────────────────────────────────────────────────────────

def assess_pronunciation(
    audio_path: str,
    expected_text: str,
    language_code: str = "ja",
) -> dict:
    """
    Run Azure Pronunciation Assessment on a recorded audio file.

    Returns:
        {
            pronunciation_score: float,     # 0-100
            fluency_score:       float,     # 0-100
            completeness_score:  float,     # 0-100
            words: [
                {
                    word:           str,
                    accuracy_score: float,
                    phonemes: [{ phoneme: str, score: float }, ...]
                }
            ],
            source: "azure" | "mock" | "unavailable" | "azure_no_match"
        }

    Never raises — always returns a valid dict.
    """
    if not is_azure_configured():
        logger.warning("[Azure] Credentials not set — using mock scores.")
        return _mock_result(expected_text)

    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        logger.error("[Azure] SDK not installed. Run: pip install azure-cognitiveservices-speech")
        return _mock_result(expected_text)

    locale = get_locale(language_code)
    print(f"🎤 [Azure] locale={locale} | '{expected_text[:50]}'")

    wav_path = None
    try:
        wav_path = _ensure_wav(audio_path)

        speech_config = speechsdk.SpeechConfig(
            subscription=settings.AZURE_SPEECH_KEY,
            region=settings.AZURE_SPEECH_REGION,
        )
        speech_config.speech_recognition_language = locale

        audio_config = speechsdk.audio.AudioConfig(filename=wav_path)

        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=expected_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True,
        )

        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
        )
        pronunciation_config.apply_to(recognizer)

        result = recognizer.recognize_once()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            assessment = speechsdk.PronunciationAssessmentResult(result)
            parsed = _parse_result(assessment, result)
            print(
                f"   ✅ [Azure] pronunciation={parsed['pronunciation_score']:.1f} "
                f"fluency={parsed['fluency_score']:.1f} "
                f"completeness={parsed['completeness_score']:.1f}"
            )
            return parsed

        elif result.reason == speechsdk.ResultReason.NoMatch:
            logger.warning("[Azure] No speech recognized.")
            return _empty_result("azure_no_match")

        else:
            logger.warning("[Azure] Recognition failed: %s", result.reason)
            return _empty_result("azure_error")

    except Exception as e:
        logger.error("[Azure] Assessment failed: %s", e)
        return _empty_result("azure_error")

    finally:
        # Clean up temp WAV only if we created it
        if wav_path and wav_path != audio_path:
            try:
                os.unlink(wav_path)
            except Exception:
                pass


def _parse_result(assessment, result) -> dict:
    """Extract word + phoneme scores from Azure result JSON."""
    words = []
    try:
        result_json = json.loads(
            result.properties.get("SpeechServiceResponse_JsonResult", "{}")
        )
        nbest = result_json.get("NBest", [])
        if nbest:
            for w in nbest[0].get("Words", []):
                pa = w.get("PronunciationAssessment", {})
                phonemes = [
                    {
                        "phoneme": ph.get("Phoneme", ""),
                        "score": float(
                            ph.get("PronunciationAssessment", {}).get("AccuracyScore", 0.0)
                        ),
                    }
                    for ph in w.get("Phonemes", [])
                ]
                words.append({
                    "word": w.get("Word", ""),
                    "accuracy_score": float(pa.get("AccuracyScore", 0.0)),
                    "phonemes": phonemes,
                })
    except Exception as e:
        logger.warning("[Azure] Failed to parse word detail: %s", e)

    return {
        "pronunciation_score": float(assessment.pronunciation_score or 0.0),
        "fluency_score": float(assessment.fluency_score or 0.0),
        "completeness_score": float(assessment.completeness_score or 0.0),
        "words": words,
        "source": "azure",
    }


def _ensure_wav(audio_path: str) -> str:
    """Convert to 16kHz mono WAV if needed. Azure SDK requires WAV."""
    if audio_path.lower().endswith(".wav"):
        return audio_path

    import subprocess
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp.close()
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", audio_path,
             "-ar", "16000", "-ac", "1", "-f", "wav", tmp.name],
            check=True, capture_output=True,
        )
        return tmp.name
    except Exception as e:
        logger.warning("[Azure] ffmpeg conversion failed: %s — using original", e)
        return audio_path