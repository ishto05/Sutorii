# Sutorii - Codebase Progress Documentation

**Last Updated:** February 21, 2026
**Project Root:** `d:\Sutorii`

---

## Project Overview

**Sutorii** is a Japanese language learning application that processes YouTube videos into interactive scenes. It uses AI (Whisper for transcription, GPT-4o-mini for script refinement and feedback) to create structured dialogue lessons for learners.

---

## What It Actually Does

### Core Functionality

1. **YouTube Video Ingestion**
   - Extracts audio from YouTube URLs using `yt-dlp`.
   - **Limit**: Enforces a 10-minute maximum video duration for MVP stability.
   - Converts audio to MP3 (128kbps) for optimized processing.

2. **AI-Powered Transcription**
   - Uses OpenAI Whisper (verbose JSON) to get word-level timing and transcription.
   - **Rate Limiting**: Integrated safety checks (10 daily AI calls, 3 per minute) via `rate_limit.py`.

3. **Script Refinement**
   - GPT-4o-mini cleans transcript segments into structured dialogue.
   - **Normalization**: Ensures monotonic timestamps, prevents overlaps, and enforces minimum line durations.
   - **Formatting**: Automatically adds furigana (hiragana readings) in parentheses for all kanji.

4. **Interactive Pronunciation Evaluation**
   - Users record their voice directly in the browser.
   - The system transcribes user audio and normalizes it (removes readings/punctuation).
   - **Fuzzy Matching**: Computes similarity scores based on coverage and edit distance.
   - **AI Feedback**: GPT-4o-mini provides a single sentence of encouragement and an improvement tip.

5. **Storage**
   - Uploads processed audio (MP3) to Supabase Storage with UUID-based naming.

---

## Current Implementation Status

### ✅ Implemented

#### Backend (FastAPI)
- **API Endpoints**: `/health`, `/ingest` (YouTube URL), `/evaluate` (Audio upload).
- **Services**:
  - `whisper.py`: Transcription service.
  - `gpt.py`: Script refinement and feedback logic using Structured Outputs.
  - `storage.py`: Supabase Storage manager.
  - `rate_limit.py`: In-memory rate limiting (Daily: 10, Minutely: 3).
- **Workers**:
  - `ingest.py`: Manages the YouTube download -> transcribe -> refine -> upload flow.
  - `evaluate.py`: Manages the user recording -> transcribe -> score flow.

#### Frontend (Next.js 16 + Tailwind CSS 4)
- **Split-Pane Layout**:
  - **Left**: "Link Drop Area" (IngestForm) for URL submission.
  - **Right (Top)**: Interactive script list with clickable NPC/USER lines and recorder.
  - **Right (Bottom)**: Raw JSON response view for transparency during MVP.
- **Interactions**:
  - Browser-based microphone recording.
  - Active line selection and visual feedback.
  - Fully responsive utility-based design using Tailwind CSS 4.

### 🚧 Partially Implemented / TODO
- **Phonemes & Pitch**: Database schema fields exist but logic is pending.
- **Redis**: Configuration exists but implementation is pending (currently using in-memory state).
- **Unit Testing**: Testing framework is initialized but actual tests are pending.

---

## File Structure & Actual Paths

```
d:\Sutorii\
├── backend\
│   └── app\
│       ├── app.py                    # FastAPI Routes
│       ├── config\
│       ├── services\
│       │   ├── whisper.py
│       │   ├── gpt.py
│       │   ├── storage.py
│       │   ├── rate_limit.py         # [NEW] Rate limiting service
│       │   └── evaluation\
│       └── workers\
│           ├── ingest.py             # 10m video limit, mp3 extraction
│           └── evaluate.py           # Scoring and GPT feedback
│
└── frontend\
    ├── app\
    │   ├── page.tsx                  # Main Split Layout
    └── components\
        ├── IngestForm.tsx
        ├── Recorder.tsx              # Michelphone handling
        └── EvaluationPanel.tsx       # Feedback UI
```

---

## API Endpoints

### `POST /ingest`
- **Request**: `{"youtube_url": "..."}`
- **Note**: Rejects videos > 10 minutes.

### `POST /evaluate`
- **Content-Type**: `multipart/form-data`
- **Fields**: `sceneId`, `lineId`, `expectedText`, `audio` (file).

---

## Known Issues / Roadmap
1. `requirements.txt` typo fixed.
2. In-memory rate limits reset on restart (future: Redis integration).
3. Phoneme/Pitch extraction for more granular feedback.
