import re
from app.config.config import settings
from pydantic import BaseModel
from typing import List, Literal, Optional
import json
from app.services.rate_limit import check_rate_limit
from app.models.schema import WordToken

# ─────────────────────────────────────────────────────────────────────────────
# Language metadata
# ─────────────────────────────────────────────────────────────────────────────

# Languages that use non-latin scripts — these are candidates for transliteration
NON_LATIN_LANGUAGES = {
    "ja", "ko", "zh", "ar", "hi",
    "th", "ru", "he", "fa", "el",
    "ka", "am", "si", "km", "my",
}

LANGUAGE_NAMES = {
    "ja": "Japanese",   "ko": "Korean",     "zh": "Chinese",
    "ar": "Arabic",     "hi": "Hindi",      "th": "Thai",
    "ru": "Russian",    "he": "Hebrew",     "fa": "Persian",
    "el": "Greek",      "ka": "Georgian",   "am": "Amharic",
    "si": "Sinhala",    "km": "Khmer",      "my": "Burmese",
    "en": "English",    "es": "Spanish",    "fr": "French",
    "de": "German",     "it": "Italian",    "pt": "Portuguese",
    "nl": "Dutch",      "pl": "Polish",     "tr": "Turkish",
    "vi": "Vietnamese", "id": "Indonesian", "ms": "Malay",
    "sv": "Swedish",    "da": "Danish",     "fi": "Finnish",
    "no": "Norwegian",  "cs": "Czech",      "ro": "Romanian",
    "hu": "Hungarian",  "uk": "Ukrainian",  "bg": "Bulgarian",
}


def _language_name(code: str) -> str:
    if code.lower() in ("unknown", ""):
        return "unknown"
    return LANGUAGE_NAMES.get(code.lower(), code.upper())


def _is_non_latin(lang_code: str) -> bool:
    return lang_code.lower() in NON_LATIN_LANGUAGES


def _should_transliterate(source_lang, native_lang, transliteration_enabled):
    if not transliteration_enabled:
        return False
    # If source language is unknown, trust the user's toggle
    # Don't block just because WhisperX didn't detect the language
    if source_lang in ("unknown", ""):
        return True
    if not _is_non_latin(source_lang):
        return False   # confirmed latin source → nothing to transliterate
    return True      # always generate if source is non-latin and toggle is on


# ─────────────────────────────────────────────────────────────────────────────
# GPT response models
# ─────────────────────────────────────────────────────────────────────────────


class GPTWord(BaseModel):
    word: str
    reading: Optional[str] = None
    meaning: Optional[str] = None


class GPTSceneLine(BaseModel):
    characterName: str
    text: str
    phoneticReading: Optional[str] = None
    transliteration: Optional[str] = None
    translation: Optional[str] = None
    startTime: float
    endTime: float
    words: List[GPTWord] = []


class GPTQuizQuestion(BaseModel):
    type: Literal["vocabulary", "comprehension", "grammar"]
    question: str
    expectedAnswer: str
    relatedLineId: Optional[str] = None


class ChunkLinesResponse(BaseModel):
    lines: List[GPTSceneLine]


class QuizOnlyResponse(BaseModel):
    quiz: List[GPTQuizQuestion]


class ScriptResponse(BaseModel):
    characters: List[str]
    lines: List[GPTSceneLine]
    quiz: List[GPTQuizQuestion]


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

CHUNK_SIZE = 15


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _quiz_count_for_scene(line_count: int) -> int:
    if line_count < 5:
        return 2
    elif line_count <= 10:
        return 3
    else:
        return 5


# Languages that don't use spaces between words — join with empty string
_NO_SPACE_LANGS = {"ja", "zh", "ko", "th", "my", "km", "lo", "bo"}


def _join_words(words: list, lang: str) -> str:
    """Join word tokens with the correct separator for the script."""
    sep = "" if lang in _NO_SPACE_LANGS else " "
    return sep.join(words).strip()


def _normalize_asr_text(text: str, lang: str) -> str:
    """
    Fix common WhisperX word-merge artifacts in raw ASR text.
    - Collapse runs of multiple spaces into one
    - Re-insert a space at lowercase→uppercase boundaries
      e.g. "He'sspotted" → "He's spotted"
    Skipped for CJK/no-space languages where internal spaces are meaningless.
    """
    if not text:
        return text
    if lang in _NO_SPACE_LANGS:
        return text.strip()
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"([a-z0-9'\,!?.])([A-Z])", r"\1 \2", text)
    return text.strip()


def _slim_segments(segments: list, lang: str = "unknown") -> list:
    """
    Split WhisperX segments by word-level speaker boundaries before sending to GPT.

    WhisperX assigns a segment-level speaker to whoever spoke the majority of words,
    but minority speakers only appear inside words[]. A naive slim loses those entirely.
    This function splits on speaker changes at the word level so all speakers are surfaced.
    """
    result = []

    for seg in segments:
        words = seg.get("words", [])
        seg_speaker = seg.get("speaker", "SPEAKER_00")
        seg_start = seg.get("start", 0.0)
        seg_end = seg.get("end", 0.0)

        timed_words = [
            w for w in words
            if w.get("start", 0.0) > 0.0 or w.get("end", 0.0) > 0.0
        ]

        if not timed_words:
            text = _normalize_asr_text(seg.get("text", "").strip(), lang)
            if text:
                result.append({
                    "speaker": seg_speaker,
                    "text": text,
                    "start": seg_start,
                    "end": seg_end,
                })
            continue

        current_speaker = timed_words[0].get("speaker", seg_speaker)
        current_words = []
        current_start = timed_words[0].get("start", seg_start)
        current_words_end = current_start

        for w in timed_words:
            w_speaker = w.get("speaker", seg_speaker)
            w_text = w.get("word", "").strip()
            w_start = w.get("start", 0.0)
            w_end = w.get("end", 0.0)

            if w_speaker != current_speaker and current_words:
                sub_text = _join_words(current_words, lang)
                if sub_text:
                    result.append({
                        "speaker": current_speaker,
                        "text": sub_text,
                        "start": round(current_start, 3),
                        "end": round(current_words_end, 3),
                    })
                current_speaker = w_speaker
                current_words = []
                current_start = w_start
                current_words_end = w_start

            if w_text:
                current_words.append(_normalize_asr_text(w_text, lang))
                current_words_end = w_end

        if current_words:
            sub_text = _join_words(current_words, lang)
            if sub_text:
                result.append({
                    "speaker": current_speaker,
                    "text": sub_text,
                    "start": round(current_start, 3),
                    "end": round(current_words_end, 3),
                })

    return result


def _chunk_segments(segments: list) -> list:
    return [
        segments[i : i + CHUNK_SIZE]
        for i in range(0, len(segments), CHUNK_SIZE)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Dynamic prompt builders
# ─────────────────────────────────────────────────────────────────────────────


def _chunk_system_prompt(
    source_lang: str,
    translation_lang: str,
    native_lang: str,
    transliteration_enabled: bool,
) -> str:
    src_name = _language_name(source_lang)
    native_name = _language_name(native_lang)
    do_translit = _should_transliterate(source_lang, native_lang, transliteration_enabled)

    # Language-specific text + word rules
    if source_lang == "ja":
        text_rules = (
            "TEXT RULES:\n"
            "- Preserve original sentence structure.\n"
            "- Keep kanji. Add hiragana reading in parentheses for every kanji word: 元気(げんき).\n"
            "- Do NOT romanize the text field.\n"
            "- phoneticReading: full hiragana reading of the entire line (no kanji, no romaji).\n"
        )
        word_rules = (
            "WORD RULES:\n"
            "- Include every meaningful word per line.\n"
            "- Treat compound words as single tokens (e.g. 感じ not 感+じ).\n"
            "- Do NOT split words at character level.\n"
            f"- word: original form, reading: hiragana/katakana, meaning: {translation_lang}.\n"
        )
    elif source_lang == "ko":
        text_rules = (
            "TEXT RULES:\n"
            "- Preserve original sentence structure.\n"
            "- Keep Hangul as-is in the text field.\n"
            "- phoneticReading: full Hangul phonetic reading of the line.\n"
        )
        word_rules = (
            "WORD RULES:\n"
            "- Include every meaningful word per line.\n"
            f"- word: original Hangul, reading: Hangul pronunciation, meaning: {translation_lang}.\n"
        )
    elif source_lang == "zh":
        text_rules = (
            "TEXT RULES:\n"
            "- Preserve original sentence structure.\n"
            "- Keep Chinese characters as-is in the text field.\n"
            "- phoneticReading: full pinyin with tone marks.\n"
        )
        word_rules = (
            "WORD RULES:\n"
            "- Include every meaningful word per line.\n"
            f"- word: Chinese characters, reading: pinyin with tones, meaning: {translation_lang}.\n"
        )
    elif source_lang == "ar":
        text_rules = (
            "TEXT RULES:\n"
            "- Preserve original sentence structure.\n"
            "- Keep Arabic script as-is in the text field.\n"
            "- phoneticReading: full Arabic phonetic reading.\n"
        )
        word_rules = (
            "WORD RULES:\n"
            "- Include every meaningful word per line.\n"
            f"- word: original Arabic, reading: Arabic pronunciation, meaning: {translation_lang}.\n"
        )
    else:
        # Latin-script or other languages
        text_rules = (
            "TEXT RULES:\n"
            "- Preserve original sentence structure and spelling.\n"
            "- phoneticReading: leave null.\n"
        )
        word_rules = (
            "WORD RULES:\n"
            "- Include every meaningful word per line.\n"
            f"- word: original form, reading: null, meaning: {translation_lang}.\n"
        )

    if do_translit:
        if _is_non_latin(native_lang):
            # Non-latin native user (Arabic, Hindi, etc.)
            # → phonetics written in their own script
            translit_instruction = (
                f"- transliteration: write the pronunciation of the {src_name} line "
                f"using {native_name} script phonetics. REQUIRED.\n"
                f"  Use the phonetic conventions of {native_name} to approximate "
                f"{src_name} sounds.\n"
                f"  Example: Japanese 'こんにちは' for an Arabic speaker → 'كونيتشيوا'\n"
            )
        else:
            # Latin-native user (English, Spanish, French, etc.)
            # → standard romanization in latin script
            ROMAN_SYSTEM = {
                "ja": "Romaji (Hepburn system). Example: 元気ですか → Genki desu ka?",
                "ko": "Revised Romanization of Korean. Example: 안녕하세요 → Annyeonghaseyo",
                "zh": "Pinyin with tone marks. Example: 你好 → Nǐ hǎo",
                "ar": "ALA-LC romanization. Example: مرحبا → Marḥaban",
                "hi": "IAST romanization. Example: नमस्ते → Namaste",
                "ru": "BGN/PCGN romanization.",
                "el": "ISO 843 romanization.",
            }
            system_note = ROMAN_SYSTEM.get(
                source_lang,
                "standard Latin transliteration of the source language."
            )
            translit_instruction = (
                f"- transliteration: write the standard romanization of the "
                f"{src_name} line in Latin script. REQUIRED.\n"
                f"  Use {system_note}\n"
            )
    else:
        translit_instruction = (
            "- transliteration: leave null.\n"
        )

    # Auto-detect note when language was not identified by WhisperX
    if source_lang == "unknown":
        lang_desc = "an unknown language (auto-detect from the text content)"
        autodetect_note = (
            "IMPORTANT: The source language was not detected automatically. "
            "Identify the language from the text, then apply the matching phonetic reading rules "
            "(e.g. hiragana for Japanese, pinyin for Chinese, null for Latin-script languages).\n\n"
        )
    else:
        lang_desc = f"a {src_name} video"
        autodetect_note = ""

    return (
        f"You are a language learning content editor.\n"
        f"You are given speech segments with timestamps from {lang_desc}.\n"
        f"{autodetect_note}"
        "YOUR TASKS:\n"
        "1. Split segments into short, natural dialogue lines.\n"
        "2. Assign characterName from the speaker label (use label as-is if no name is known).\n"
        "3. For each line provide:\n"
        f"   - text: original dialogue, preserved exactly.\n"
        "   - phoneticReading: as described in TEXT RULES below.\n"
        f"   - translation: natural {translation_lang} translation. REQUIRED — never null.\n"
        f"   - words: list of meaningful words with reading and meaning in {translation_lang}.\n"
        "   - transliteration: as described below.\n\n"
        f"{text_rules}\n"
        f"{word_rules}\n"
        "TRANSLITERATION:\n"
        f"{translit_instruction}\n"
        "IMPORTANT:\n"
        "- translation is REQUIRED for every single line. Never leave it null or empty.\n"
        "- Return ONLY structured data. No markdown, no explanation."
    )


def _quiz_system_prompt(
    quiz_count: int,
    source_lang: str,
    translation_lang: str,
) -> str:
    src_name = _language_name(source_lang)
    return (
        f"You are a {src_name} language learning quiz generator.\n"
        f"Generate exactly {quiz_count} quiz questions from the transcript summary provided.\n\n"
        "QUIZ RULES:\n"
        f"- Exactly {quiz_count} questions.\n"
        "- Mix types: vocabulary, comprehension, grammar.\n"
        f"- Questions must be written in {translation_lang}.\n"
        f"- expectedAnswer must be in {src_name} (the language being studied).\n"
        "- relatedLineId: reference line index e.g. 'line-1' if applicable.\n\n"
        "Return ONLY structured data. No markdown, no explanation."
    )


# ─────────────────────────────────────────────────────────────────────────────
# GPT call helpers
# ─────────────────────────────────────────────────────────────────────────────


def _call_chunk(
    client,
    chunk: list,
    source_lang: str,
    translation_lang: str,
    native_lang: str,
    transliteration_enabled: bool,
) -> List[GPTSceneLine]:
    completion = client.beta.chat.completions.parse(
        model="gpt-4o-mini",
        max_tokens=4096,
        messages=[
            {
                "role": "system",
                "content": _chunk_system_prompt(
                    source_lang, translation_lang,
                    native_lang, transliteration_enabled,
                ),
            },
            {"role": "user", "content": json.dumps(chunk, ensure_ascii=False)},
        ],
        response_format=ChunkLinesResponse,
    )

    if not completion.choices or not completion.choices[0].message.parsed:
        raise ValueError("Empty or invalid response from GPT chunk call")

    parsed = completion.choices[0].message.parsed

    for line in parsed.lines:
        if not line.translation:
            print(f"⚠️  GPT null translation: {line.text[:40]}")
        if _should_transliterate(source_lang, native_lang, transliteration_enabled):
            if not line.transliteration:
                print(f"⚠️  GPT null transliteration: {line.text[:40]}")

    usage = completion.usage
    if usage and usage.completion_tokens >= 4000:
        print(f"⚠️  GPT chunk hit token ceiling ({usage.completion_tokens} tokens)")

    return parsed.lines


def _call_quiz(
    client,
    all_lines: List[GPTSceneLine],
    quiz_count: int,
    source_lang: str,
    translation_lang: str,
) -> List[GPTQuizQuestion]:
    summary = "\n".join(
        f"line-{i+1} [{line.characterName}]: {line.translation or line.text}"
        for i, line in enumerate(all_lines)
    )

    completion = client.beta.chat.completions.parse(
        model="gpt-4o-mini",
        max_tokens=1024,
        messages=[
            {
                "role": "system",
                "content": _quiz_system_prompt(quiz_count, source_lang, translation_lang),
            },
            {"role": "user", "content": summary},
        ],
        response_format=QuizOnlyResponse,
    )

    if not completion.choices or not completion.choices[0].message.parsed:
        raise ValueError("Empty or invalid response from GPT quiz call")

    return completion.choices[0].message.parsed.quiz


def _extract_unique_characters(lines: List[GPTSceneLine]) -> List[str]:
    seen = []
    for line in lines:
        if line.characterName and line.characterName not in seen:
            seen.append(line.characterName)
    return seen


# ─────────────────────────────────────────────────────────────────────────────
# Main function
# ─────────────────────────────────────────────────────────────────────────────


def refine_script_from_whisper(
    whisper_result: dict,
    translation_language: str = "English",
    native_language: str = "en",
    transliteration_enabled: bool = True,
) -> ScriptResponse:
    """
    Refine WhisperX segments into a structured multilingual script.

    Args:
        whisper_result:          dict from WhisperX/Whisper — must contain 'segments' and 'language'
        translation_language:    full name of the language to translate into e.g. "Arabic", "Spanish"
        native_language:         ISO code of the user's native language e.g. "ar", "hi"
                                 Used to determine transliteration script.
                                 If latin-script (en, es, fr...), transliteration is skipped.
        transliteration_enabled: user toggle — False always skips transliteration
    """
    client = settings.openai_client

    if client:
        check_rate_limit("gpt")

    segments = whisper_result.get("segments", [])
    raw_lang = (whisper_result.get("language") or "unknown").strip()
    # Normalize: Whisper may return full name ("japanese") instead of ISO code ("ja")
    WHISPER_NAME_TO_ISO = {
        "afrikaans":"af","arabic":"ar","armenian":"hy","azerbaijani":"az",
        "belarusian":"be","bosnian":"bs","bulgarian":"bg","catalan":"ca",
        "chinese":"zh","croatian":"hr","czech":"cs","danish":"da","dutch":"nl",
        "english":"en","estonian":"et","finnish":"fi","french":"fr","galician":"gl",
        "german":"de","greek":"el","hebrew":"he","hindi":"hi","hungarian":"hu",
        "icelandic":"is","indonesian":"id","italian":"it","japanese":"ja",
        "kannada":"kn","kazakh":"kk","korean":"ko","latvian":"lv","lithuanian":"lt",
        "macedonian":"mk","malay":"ms","marathi":"mr","maori":"mi","nepali":"ne",
        "norwegian":"no","persian":"fa","polish":"pl","portuguese":"pt",
        "romanian":"ro","russian":"ru","serbian":"sr","slovak":"sk","slovenian":"sl",
        "spanish":"es","swahili":"sw","swedish":"sv","tagalog":"tl","tamil":"ta",
        "thai":"th","turkish":"tr","ukrainian":"uk","urdu":"ur","vietnamese":"vi",
        "welsh":"cy",
    }
    source_lang = WHISPER_NAME_TO_ISO.get(raw_lang.lower(), raw_lang.lower().split("-")[0])
    quiz_count = _quiz_count_for_scene(len(segments))
    do_translit = _should_transliterate(source_lang, native_language, transliteration_enabled)

    print(f"🌐 Source:          {_language_name(source_lang)} ({source_lang})")
    print(f"🌐 Translation:     {translation_language}")
    print(f"🌐 Native:          {_language_name(native_language)} ({native_language})")
    print(f"🌐 Transliteration: {'on → ' + _language_name(native_language) + ' script' if do_translit else 'off'}")

    # ── MOCK ─────────────────────────────────────────────────────────────────
    if not settings.AI_ENABLED or not client:
        print("🛠️  MOCK GPT: returning dummy lines...")
        return ScriptResponse(
            characters=["Character 1", "Character 2"],
            lines=[
                GPTSceneLine(
                    characterName="Character 1",
                    text="こんにちは、元気(げんき)ですか？",
                    phoneticReading="こんにちは、げんきですか？",
                    transliteration="konnichiwa, genki desu ka?" if do_translit else None,
                    translation=f"Hello, how are you? ({translation_language})",
                    startTime=0.0, endTime=2.5,
                    words=[
                        GPTWord(word="こんにちは", reading="こんにちは", meaning="hello"),
                        GPTWord(word="元気", reading="げんき", meaning="energy / health"),
                    ],
                ),
                GPTSceneLine(
                    characterName="Character 2",
                    text="はい、元気(げんき)です！",
                    phoneticReading="はい、げんきです！",
                    transliteration="هاي، قينكي ديسو!" if do_translit else None,
                    translation=f"Yes, I am fine! ({translation_language})",
                    startTime=2.6, endTime=4.5,
                    words=[
                        GPTWord(word="はい", reading="はい", meaning="yes"),
                        GPTWord(word="元気", reading="げんき", meaning="energy / health"),
                    ],
                ),
            ],
            quiz=[
                GPTQuizQuestion(type="vocabulary", question="What does 元気 mean?",
                                expectedAnswer="げんき"),
                GPTQuizQuestion(type="comprehension",
                                question="What did Character 1 ask?",
                                expectedAnswer="元気ですか"),
            ],
        )

    # ── REAL GPT CALL (chunked) ───────────────────────────────────────────────
    if not segments:
        raise ValueError("Whisper result missing segments; cannot build script")

    slim = _slim_segments(segments, lang=source_lang)
    chunks = _chunk_segments(slim)

    print(f"📦 GPT chunking: {len(slim)} segments → {len(chunks)} chunks (CHUNK_SIZE={CHUNK_SIZE})")

    all_lines: List[GPTSceneLine] = []
    for i, chunk in enumerate(chunks):
        print(f"   🔄 Chunk {i+1}/{len(chunks)} ({len(chunk)} segments)...")
        try:
            chunk_lines = _call_chunk(
                client, chunk,
                source_lang, translation_language,
                native_language, transliteration_enabled,
            )
            all_lines.extend(chunk_lines)
            print(f"   ✅ Chunk {i+1}: {len(chunk_lines)} lines")
        except Exception as e:
            print(f"   ❌ Chunk {i+1} failed: {e}")
            raise RuntimeError(f"GPT chunk {i+1} failed: {str(e)}") from e

    print(f"   🔄 Quiz ({quiz_count} questions)...")
    try:
        quiz = _call_quiz(client, all_lines, quiz_count, source_lang, translation_language)
        print(f"   ✅ Quiz: {len(quiz)} questions")
    except Exception as e:
        print(f"   ❌ Quiz failed: {e}")
        raise RuntimeError(f"GPT quiz call failed: {str(e)}") from e

    return ScriptResponse(
        characters=_extract_unique_characters(all_lines),
        lines=all_lines,
        quiz=quiz,
    )