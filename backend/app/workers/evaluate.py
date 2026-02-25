import uuid
from datetime import datetime
from app.services.whisper import transcribe
from app.models.schema import EvaluationResult
from app.services.evaluation.normalize import normalize_text
from app.services.evaluation.similarity import compute_scores
from app.config.config import settings


def evaluate_line(
    scene_id: str,
    line_id: str,
    expected_text: str,
    audio_path: str,
) -> EvaluationResult:
    transcript = transcribe(audio_path)

    # 1️⃣ Normalize texts
    expected_norm = normalize_text(expected_text)
    actual_norm = normalize_text(transcript["text"])

    # 2️⃣ Similarity + word scoring
    scoring = compute_scores(expected_norm, actual_norm)

    overall_score = scoring["overall"]
    word_scores = scoring["wordScores"]

    # 3️⃣ GPT feedback (real AI preferred)
    feedback_summary = "Good attempt! Keep practicing."

    gpt_client = settings.openai_client

    if gpt_client:
        try:
            completion = gpt_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a Japanese language tutor.\n"
                            "Give one sentence of encouragement and one concrete improvement tip."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Expected: {expected_text}\n"
                            f"User said: {transcript['text']}\n"
                            f"Score: {overall_score}"
                        ),
                    },
                ],
                max_tokens=60,
            )
            feedback_summary = completion.choices[0].message.content.strip()
        except Exception:
            pass  # fallback stays

    return EvaluationResult(
        evaluationId=str(uuid.uuid4()),
        sceneId=scene_id,
        lineId=line_id,
        transcript=transcript["text"],
        scores={"overall": overall_score},
        wordScores=word_scores,
        feedback={"summary": feedback_summary},
        metadata={
            "createdAt": datetime.utcnow().isoformat(),
            "version": "v1",
        },
    )
