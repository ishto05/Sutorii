from typing import List, Dict
from difflib import SequenceMatcher


def similarity_ratio(a: str, b: str) -> float:
    """
    Returns a similarity score between 0.0 and 1.0
    """
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def tokenize(text: str) -> List[str]:
    """
    MVP tokenization.
    For Japanese, fallback is character-level tokens.
    """
    if " " in text:
        return text.split()
    return list(text)


def compute_scores(
    expected: str,
    actual: str,
) -> Dict:
    """
    Returns overall score and per-word scores.
    """

    expected_tokens = tokenize(expected)
    actual_tokens = tokenize(actual)

    matched = 0
    word_scores = []

    for token in expected_tokens:
        if token in actual_tokens:
            matched += 1
            score = 1.0
        else:
            score = 0.0

        word_scores.append(
            {
                "word": token,
                "score": score,
            }
        )

    coverage = matched / max(len(expected_tokens), 1)
    edit_similarity = similarity_ratio(expected, actual)

    overall = round(0.7 * coverage + 0.3 * edit_similarity, 3)

    return {
        "overall": overall,
        "wordScores": word_scores,
    }
