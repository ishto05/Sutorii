import re
import unicodedata


KANJI_READING_PATTERN = re.compile(r"\((.*?)\)")  # removes (げんき)


def normalize_text(text: str) -> str:
    """
    Normalize Japanese text for fair comparison.
    Used ONLY for evaluation, never for display.
    """

    if not text:
        return ""

    # 1. Unicode normalization
    text = unicodedata.normalize("NFKC", text)

    # 2. Remove kana readings in parentheses
    text = re.sub(KANJI_READING_PATTERN, "", text)

    # 3. Remove punctuation
    text = re.sub(r"[。、！？!?.,]", "", text)

    # 4. Normalize whitespace
    text = re.sub(r"\s+", " ", text)

    # 5. Lowercase (safe even for JP)
    text = text.lower().strip()

    return text
