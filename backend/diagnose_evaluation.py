"""
diagnose_evaluation.py
─────────────────────────────────────────────────────────────────────────────
Test suite for the evaluation engine v2.
Run from D:\\Sutorii\\backend:
    python diagnose_evaluation.py
─────────────────────────────────────────────────────────────────────────────
"""

import sys, os, struct, wave, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

results = []

def check(name, condition, detail=""):
    mark = "✅" if condition else "❌"
    print(f"{mark} {name}" + (f"  ({detail})" if detail else ""))
    results.append((name, condition))
    return condition


# ── Test 1: Locale mapping ────────────────────────────────────────────────────
print("\n── 1. Azure locale mapping ──────────────────────────────────────────")
from app.services.azure_pronunciation import get_locale, LOCALE_MAP

cases = [("ja","ja-JP"),("en","en-US"),("ko","ko-KR"),("zh","zh-CN"),
         ("ar","ar-SA"),("hi","hi-IN"),("xx","en-US"),("JA","ja-JP"),
         ("unknown","en-US"),("","en-US")]   # ← unknown/empty must not crash Azure
all_ok = all(get_locale(c) == e for c, e in cases)
check("All locale mappings correct", all_ok, f"{len(LOCALE_MAP)} languages")


# ── Test 2: Azure mock mode ───────────────────────────────────────────────────
print("\n── 2. Azure mock mode (no credentials) ──────────────────────────────")
from app.services.azure_pronunciation import assess_pronunciation
from app.config.config import settings

orig_key = settings.AZURE_SPEECH_KEY
settings.AZURE_SPEECH_KEY = ""

r = assess_pronunciation("/nonexistent.wav", "おはよう", "ja")
check("Mock returns dict",             isinstance(r, dict))
check("Mock source=mock",              r.get("source") == "mock")
check("Mock score in range",           0 <= r["pronunciation_score"] <= 100)
check("Mock words is list",            isinstance(r.get("words"), list))

settings.AZURE_SPEECH_KEY = orig_key


# ── Tests 3-6: Pitch DTW ──────────────────────────────────────────────────────
print("\n── 3-6. Pitch DTW comparison ────────────────────────────────────────")
from app.services.pitch_compare import (
    compare_pitch, _dtw_distance, _normalize, _clean_pitch, _pitch_feedback
)

# identical → 0
arr = np.array([120.,130.,125.,140.,135.])
check("DTW identical → 0",            _dtw_distance(arr, arr) == 0.0)

# different → >0
flat    = np.array([120.,120.,120.,120.,120.])
natural = np.array([100.,120.,150.,130.,110.])
d = _dtw_distance(_normalize(_clean_pitch(flat)), _normalize(_clean_pitch(natural)))
check("DTW flat vs natural → >0",     d > 0, f"d={d:.3f}")

# no audio → unavailable
r2 = compare_pitch("/nonexistent.wav", [100.,110.,120.])
check("No audio → score=-1",          r2["pitch_score"] == -1.0)
check("No audio → unavailable",       r2["pitch_feedback"] == "unavailable")

# feedback labels
check("Flat → 'flat'",
      _pitch_feedback(np.array([120.,121.,120.,119.]),
                      np.array([100.,130.,160.,140.,110.]), 45.0) == "flat")
check("Good score → 'good'",
      _pitch_feedback(natural, natural, 85.0) == "good")
check("Rising vs falling → 'rising'",
      _pitch_feedback(np.array([100.,110.,130.,160.,180.]),
                      np.array([180.,160.,140.,120.,100.]), 30.0) == "rising")


# ── Tests 7-9: Text accuracy ──────────────────────────────────────────────────
print("\n── 7-9. Text accuracy ───────────────────────────────────────────────")
from app.services.evaluation.normalize import normalize_text
from app.services.evaluation.similarity import compute_scores

s_perfect  = compute_scores(normalize_text("おはようございます"), normalize_text("おはようございます"))
s_empty    = compute_scores(normalize_text("おはようございます"), "")
s_partial  = compute_scores(normalize_text("おはようございます"), normalize_text("おはよう"))

check("Perfect match → ≈1.0",   s_perfect["overall"] >= 0.99,  f"{s_perfect['overall']:.3f}")
check("Empty → 0.0",            s_empty["overall"] == 0.0,     f"{s_empty['overall']:.3f}")
check("Partial → 0<x<1",        0 < s_partial["overall"] < 1.0, f"{s_partial['overall']:.3f}")


# ── Test 10: Weight sums ──────────────────────────────────────────────────────
print("\n── 10. Scoring weights ──────────────────────────────────────────────")
from app.workers.evaluate import WEIGHTS, WEIGHTS_NO_PITCH

check("WEIGHTS sum=1.0",          abs(sum(WEIGHTS.values())-1.0) < 1e-9)
check("WEIGHTS_NO_PITCH sum=1.0", abs(sum(WEIGHTS_NO_PITCH.values())-1.0) < 1e-9)
check("pitchAccuracy=0 when no pitch", WEIGHTS_NO_PITCH["pitchAccuracy"] == 0.0)


# ── Test 11: Zero fallback ────────────────────────────────────────────────────
print("\n── 11. Zero result fallback ─────────────────────────────────────────")
from app.workers.evaluate import _zero_result

z = _zero_result("scene-x", {"line_id": "line-1", "expected_text": "test"})
check("Zero result valid",  hasattr(z, "scores"))
check("Zero overall=0",     z.scores.overall == 0.0)
check("Zero never raises",  True)


# ── Test 12: Full pipeline mock ───────────────────────────────────────────────
print("\n── 12. Full pipeline mock ───────────────────────────────────────────")

def _make_wav(path, duration=1.0, freq=440.0, sr=16000):
    n = int(sr * duration)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        for i in range(n):
            v = int(32767 * 0.3 * np.sin(2 * np.pi * freq * i / sr))
            wf.writeframes(struct.pack("<h", v))

tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
tmp.close()
_make_wav(tmp.name)

try:
    from app.workers.evaluate import evaluate_session

    session = evaluate_session(
        scene_id="test-scene-001",
        recordings=[
            {
                "line_id":       "line-1",
                "expected_text": "おはようございます",
                "audio_path":    tmp.name,
                "native_pitch":  [100., 110., 120., 115., 105.],
                "line_start":    0.0,
                "line_end":      1.0,
            },
            {
                "line_id":       "line-2",
                "expected_text": "元気ですか",
                "audio_path":    tmp.name,
                "native_pitch":  None,
                "line_start":    0.0,
                "line_end":      1.0,
            },
        ],
        language_code="ja",
    )

    check("Session returns object",        hasattr(session, "lines"))
    check("Session has 2 lines",           len(session.lines) == 2)
    check("Overall score in range",        0 <= session.overallScore <= 100,
          f"score={session.overallScore}")
    check("Line1 wordScores is list",      isinstance(session.lines[0].wordScores, list))
    check("Line2 pitch=-1 (no data)",      session.lines[1].scores.pitchAccuracy == -1.0)
    check("Session feedback is str",       isinstance(session.sessionFeedback, str))
    check("Metadata has createdAt",        "createdAt" in session.metadata)

except Exception as e:
    import traceback
    check("Full pipeline no crash", False, str(e))
    traceback.print_exc()
finally:
    try: os.unlink(tmp.name)
    except: pass


# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "="*60)
passed = sum(1 for _, ok in results if ok)
total  = len(results)
print(f"Results: {passed}/{total} passed")
failed = [n for n, ok in results if not ok]
if failed:
    print("Failed:")
    for n in failed: print(f"  ❌ {n}")
else:
    print("All tests passed ✅")
print("="*60)