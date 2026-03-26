"""
workers/evaluate.py
─────────────────────────────────────────────────────────────────────────────
Session evaluation worker.

Processes all recorded lines at session end:
    1. Azure Pronunciation Assessment (pronunciation, fluency, completeness)
    2. Whisper transcription → text accuracy (Levenshtein)
    3. Pitch DTW comparison vs stored native pitch
    4. Score aggregation with configurable weights
    5. GPT-4o-mini session feedback

Returns SessionEvaluation with per-line EvaluationResult objects.
─────────────────────────────────────────────────────────────────────────────
"""

import uuid
import logging
from datetime import datetime
from typing import List, Optional

from app.config.config import settings
from app.models.schema import (
    EvaluationResult,
    SessionEvaluation,
    LineScores,
    LineFeedback,
    WordEvaluation,
    PhonemeScore,
)
from app.services.whisper import transcribe
from app.services.azure_pronunciation import assess_pronunciation, is_azure_configured
from app.services.pitch_compare import compare_pitch
from app.services.evaluation.normalize import normalize_text
from app.services.evaluation.similarity import compute_scores

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Scoring weights
# ─────────────────────────────────────────────────────────────────────────────

WEIGHTS = {
    "textAccuracy":  0.25,
    "pronunciation": 0.35,
    "fluency":       0.20,
    "pitchAccuracy": 0.15,
    "completeness":  0.05,
}

# When pitch data is unavailable, redistribute its weight to pronunciation
WEIGHTS_NO_PITCH = {
    "textAccuracy":  0.25,
    "pronunciation": 0.50,  # absorbs pitch weight
    "fluency":       0.20,
    "pitchAccuracy": 0.00,
    "completeness":  0.05,
}


# ─────────────────────────────────────────────────────────────────────────────
# Per-line evaluation
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_line(
    scene_id: str,
    line_id: str,
    expected_text: str,
    audio_path: str,
    language_code: str,            # required — pass ScenePackage.language
    native_pitch: Optional[List[float]] = None,
    line_start: float = 0.0,
    line_end: float = 0.0,
) -> EvaluationResult:
    """
    Evaluate a single recorded line against the expected text.

    Args:
        scene_id:      Scene UUID
        line_id:       e.g. "line-3"
        expected_text: The text the user was supposed to say
        audio_path:    Path to user's recorded WAV/WebM
        language_code: ISO 639-1 source language from ScenePackage.language
                       e.g. "ja", "en", "ko". Pass "unknown" if undetected —
                       Azure will fall back to en-US gracefully.
        native_pitch:  Stored pitch contour for this line
        line_start:    Line start time (for pitch extraction)
        line_end:      Line end time
    """
    print(f"📊 Evaluating {line_id} | lang={language_code} | azure={is_azure_configured()}")

    # ── A. Whisper transcription → text accuracy ──────────────────────────────
    try:
        whisper_result = transcribe(audio_path)
        transcript = whisper_result.get("text", "").strip()
    except Exception as e:
        logger.warning("[Eval] Whisper failed for %s: %s", line_id, e)
        transcript = ""

    expected_norm = normalize_text(expected_text)
    actual_norm = normalize_text(transcript)
    text_scoring = compute_scores(expected_norm, actual_norm)
    text_accuracy = round(text_scoring["overall"] * 100, 1)

    # ── B. Azure pronunciation assessment ────────────────────────────────────
    azure_result = assess_pronunciation(
        audio_path=audio_path,
        expected_text=expected_text,
        language_code=language_code,
    )
    pronunciation = azure_result["pronunciation_score"]
    fluency = azure_result["fluency_score"]
    completeness = azure_result["completeness_score"]

    # ── C. Pitch comparison ───────────────────────────────────────────────────
    pitch_result = compare_pitch(
        audio_path=audio_path,
        native_pitch=native_pitch,
        start=line_start,
        end=line_end,
    )
    pitch_score = pitch_result["pitch_score"]      # -1.0 if unavailable
    pitch_feedback = pitch_result["pitch_feedback"]

    # ── D. Score aggregation ──────────────────────────────────────────────────
    pitch_available = pitch_score >= 0.0
    weights = WEIGHTS if pitch_available else WEIGHTS_NO_PITCH

    overall = round(
        text_accuracy   * weights["textAccuracy"]  +
        pronunciation   * weights["pronunciation"] +
        fluency         * weights["fluency"]        +
        (pitch_score if pitch_available else 0.0) * weights["pitchAccuracy"] +
        completeness    * weights["completeness"],
        1,
    )

    scores = LineScores(
        overall=overall,
        textAccuracy=text_accuracy,
        pronunciation=round(pronunciation, 1),
        fluency=round(fluency, 1),
        completeness=round(completeness, 1),
        pitchAccuracy=round(pitch_score, 1),
    )

    # ── E. Word scores from Azure ─────────────────────────────────────────────
    word_scores = [
        WordEvaluation(
            word=w["word"],
            score=round(w["accuracy_score"], 1),
            phonemes=[
                PhonemeScore(phoneme=p["phoneme"], score=round(p["score"], 1))
                for p in w.get("phonemes", [])
            ],
        )
        for w in azure_result.get("words", [])
    ]

    # ── F. Per-line GPT feedback ──────────────────────────────────────────────
    feedback = _generate_line_feedback(
        expected_text=expected_text,
        transcript=transcript,
        scores=scores,
        pitch_feedback=pitch_feedback,
        word_scores=word_scores,
        language_code=language_code,
    )

    return EvaluationResult(
        evaluationId=str(uuid.uuid4()),
        sceneId=scene_id,
        lineId=line_id,
        expectedText=expected_text,
        transcript=transcript,
        scores=scores,
        wordScores=word_scores,
        pitchFeedback=pitch_feedback,
        feedback=feedback,
        metadata={
            "createdAt": datetime.utcnow().isoformat(),
            "azureSource": azure_result.get("source", "unknown"),
            "version": "v2",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Session evaluation (all lines)
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_session(
    scene_id: str,
    recordings: List[dict],
    language_code: str,            # required — pass ScenePackage.language
) -> SessionEvaluation:
    """
    Evaluate all recorded lines for a roleplay session.

    Args:
        scene_id:      Scene UUID
        recordings:    List of dicts:
                       {
                           line_id:      str,
                           expected_text: str,
                           audio_path:   str,
                           native_pitch: Optional[List[float]],
                           line_start:   float,
                           line_end:     float,
                       }
        language_code: ISO 639-1 source language from ScenePackage.language.
                       Pass "unknown" if undetected — degrades gracefully.

    Returns SessionEvaluation.
    """
    print(f"📊 Session evaluation: {len(recordings)} lines | scene={scene_id}")

    results: List[EvaluationResult] = []

    for rec in recordings:
        try:
            result = evaluate_line(
                scene_id=scene_id,
                line_id=rec["line_id"],
                expected_text=rec["expected_text"],
                audio_path=rec["audio_path"],
                language_code=language_code,
                native_pitch=rec.get("native_pitch"),
                line_start=rec.get("line_start", 0.0),
                line_end=rec.get("line_end", 0.0),
            )
            results.append(result)
            print(f"   ✅ {rec['line_id']}: overall={result.scores.overall}")
        except Exception as e:
            logger.error("[Eval] Line %s failed: %s", rec.get("line_id"), e)
            # Append a zero-score result so session still completes
            results.append(_zero_result(scene_id, rec))

    overall_score = round(
        sum(r.scores.overall for r in results) / max(len(results), 1), 1
    )

    session_feedback = _generate_session_feedback(results, language_code)

    return SessionEvaluation(
        sessionId=str(uuid.uuid4()),
        sceneId=scene_id,
        overallScore=overall_score,
        linesEvaluated=len(results),
        lines=results,
        sessionFeedback=session_feedback,
        metadata={
            "createdAt": datetime.utcnow().isoformat(),
            "version": "v2",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Feedback generation
# ─────────────────────────────────────────────────────────────────────────────

def _generate_line_feedback(
    expected_text: str,
    transcript: str,
    scores: LineScores,
    pitch_feedback: str,
    word_scores: List[WordEvaluation],
    language_code: str,
) -> LineFeedback:
    """Generate actionable per-line feedback using GPT or rule-based fallback."""

    tips = []

    # Rule-based tips (always generated, fast)
    if scores.textAccuracy < 70:
        tips.append(f"Try to match the original text more closely.")
    if scores.pronunciation < 60:
        # Find worst-scoring words
        weak = sorted(word_scores, key=lambda w: w.score)[:2]
        for w in weak:
            tips.append(f"Practice the pronunciation of '{w.word}'.")
    if pitch_feedback == "flat":
        tips.append("Add more intonation — try not to speak in a monotone.")
    elif pitch_feedback == "rising":
        tips.append("Your intonation is rising where it should fall — listen to the original again.")
    elif pitch_feedback == "falling":
        tips.append("Your intonation is falling where it should rise — try again with more energy.")
    if scores.fluency < 60:
        tips.append("Work on your speaking pace — try to sound more natural and less halting.")

    # GPT summary (only if client available)
    summary = _gpt_line_summary(expected_text, transcript, scores, language_code)

    return LineFeedback(summary=summary, tips=tips[:3])  # cap at 3 tips


def _gpt_line_summary(
    expected_text: str,
    transcript: str,
    scores: LineScores,
    language_code: str,
) -> str:
    """Generate a one-sentence summary using GPT. Falls back to rule-based."""
    client = settings.openai_client
    if not client or not settings.AI_ENABLED:
        return _rule_based_summary(scores)

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=80,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a language tutor giving feedback on a learner's pronunciation.\n"
                        "Give exactly ONE short encouraging sentence + one concrete improvement tip.\n"
                        "Be specific, not generic. Max 2 sentences total."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Expected: {expected_text}\n"
                        f"Said:     {transcript}\n"
                        f"Scores: pronunciation={scores.pronunciation:.0f}, "
                        f"fluency={scores.fluency:.0f}, "
                        f"overall={scores.overall:.0f}"
                    ),
                },
            ],
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        logger.warning("[Eval] GPT line feedback failed: %s", e)
        return _rule_based_summary(scores)


def _generate_session_feedback(
    results: List[EvaluationResult],
    language_code: str,
) -> str:
    """Generate a session-level summary using GPT."""
    client = settings.openai_client
    if not client or not settings.AI_ENABLED:
        return _rule_based_session_summary(results)

    avg_pronunciation = sum(r.scores.pronunciation for r in results) / max(len(results), 1)
    avg_fluency = sum(r.scores.fluency for r in results) / max(len(results), 1)
    overall = sum(r.scores.overall for r in results) / max(len(results), 1)

    # Find best and worst lines
    sorted_by_score = sorted(results, key=lambda r: r.scores.overall)
    worst_line = sorted_by_score[0] if sorted_by_score else None
    best_line = sorted_by_score[-1] if sorted_by_score else None

    try:
        summary_text = (
            f"Session: {len(results)} lines\n"
            f"Overall: {overall:.0f}/100\n"
            f"Avg pronunciation: {avg_pronunciation:.0f}/100\n"
            f"Avg fluency: {avg_fluency:.0f}/100\n"
        )
        if worst_line:
            summary_text += f"Weakest line: '{worst_line.expectedText}' ({worst_line.scores.overall:.0f}/100)\n"
        if best_line:
            summary_text += f"Best line: '{best_line.expectedText}' ({best_line.scores.overall:.0f}/100)\n"

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=120,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a language tutor giving a session summary.\n"
                        "Write 2-3 sentences: what they did well, what to focus on next.\n"
                        "Be encouraging and specific."
                    ),
                },
                {"role": "user", "content": summary_text},
            ],
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        logger.warning("[Eval] GPT session feedback failed: %s", e)
        return _rule_based_session_summary(results)


def _rule_based_summary(scores: LineScores) -> str:
    if scores.overall >= 80:
        return "Great job! Your pronunciation is strong."
    elif scores.overall >= 60:
        return "Good attempt! Keep practicing to improve your pronunciation."
    else:
        return "Keep going — listen to the original audio and try again."


def _rule_based_session_summary(results: List[EvaluationResult]) -> str:
    overall = sum(r.scores.overall for r in results) / max(len(results), 1)
    if overall >= 80:
        return f"Excellent session! You scored {overall:.0f}/100 overall. Keep it up!"
    elif overall >= 60:
        return f"Good session! You scored {overall:.0f}/100. Focus on pronunciation to improve further."
    else:
        return f"Session complete. You scored {overall:.0f}/100. Listen to the original and try again!"


def _zero_result(scene_id: str, rec: dict) -> EvaluationResult:
    """Fallback zero-score result when evaluation fails for a line."""
    return EvaluationResult(
        evaluationId=str(uuid.uuid4()),
        sceneId=scene_id,
        lineId=rec.get("line_id", "unknown"),
        expectedText=rec.get("expected_text", ""),
        transcript="",
        scores=LineScores(
            overall=0.0, textAccuracy=0.0,
            pronunciation=0.0, fluency=0.0,
            completeness=0.0, pitchAccuracy=-1.0,
        ),
        wordScores=[],
        pitchFeedback="unavailable",
        feedback=LineFeedback(summary="Evaluation failed for this line.", tips=[]),
        metadata={"createdAt": datetime.utcnow().isoformat(), "version": "v2", "error": True},
    )