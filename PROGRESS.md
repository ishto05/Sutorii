# Sutorii - Codebase Progress Documentation

**Last Updated:** March 4, 2026  
**Project Root:** `d:\Sutorii`

---

## Project Overview

**Sutorii** is a Japanese language learning application that processes YouTube videos into interactive scenes. It uses AI (Whisper/WhisperX for transcription, GPT-4o-mini for script refinement and feedback) to create structured dialogue lessons and evaluates user pronunciation via recording and similarity scoring.

---

## What It Actually Does

### Core Functionality

1. **YouTube Video Ingestion**
   - Extracts audio from YouTube URLs using `yt-dlp`.
   - **Limit:** Enforces a 10-minute maximum video duration for MVP.
   - Converts audio to MP3 (128kbps); falls back to m4a/webm/wav if FFmpeg post-processing fails.
   - Phased pipeline: Download → Transcribe → Refine → Upload → Assemble.

2. **AI-Powered Transcription & Diarization**
   - **Primary:** Uses a Colab-hosted WhisperX service for speaker diarization (segmenting by speaker).
   - **Fallback:** Uses OpenAI Whisper (`response_format="verbose_json"`) if Colab service is unavailable.
   - **Rate limiting:** Integrated safety (10 daily AI calls, 3 per minute) via `rate_limit.py`.

3. **Script Refinement**
   - GPT-4o-mini takes transcription segments and returns structured dialogue via **Structured Outputs** (`ScriptResponse` / `GPTSceneLine`: speaker, text, startTime, endTime).
   - **Furigana:** Prompt instructs GPT to add hiragana/katakana readings in parentheses after kanji (e.g. 元気(げんき)ですか？).
   - **Normalization:** `normalize_scene_lines()` ensures monotonic timestamps and minimum line duration (0.3s).

4. **Interactive Roleplay & Evaluation**
   - **Roleplay Mode:** Frontend synchronizes video playback with text segments. The video pauses automatically when it's the USER's turn to speak.
   - **Recording:** Captures user audio for each assigned line.
   - **Scoring:** Backend transcribes user audio and compares it to expected text using character-level tokenization and edit-distance ratio.
   - **Feedback:** GPT-4o-mini provides encouraging feedback and improvement tips.

5. **Storage**
   - Processes and stores audio in Supabase Storage.

---

## Current Implementation Status

### ✅ Implemented

#### Backend (FastAPI)
- **API:** `app.py` — `/health`, `POST /ingest`, `POST /evaluate`.
- **Config:** `config/config.py` — Startup service checks for Supabase, OpenAI, and WhisperX; handles `.env` loading and client initialization.
- **Services:**
  - `whisper.py` — Hybrid transcription (WhisperX with OpenAI fallback).
  - `whisperX_client.py` — Client for Colab-hosted diarization service.
  - `gpt.py` — Script refinement and feedback logic.
  - `storage.py` — Supabase storage integration.
  - `rate_limit.py` — In-memory rate limiting.
  - `evaluation/` — Normalization and similarity scoring logic.
- **Workers:**
  - `ingest.py` — 5-phase ingestion pipeline.
  - `evaluate.py` — User recording evaluation pipeline.
- **Diagnostics:**
  - `diagnose_pipeline.py` — Manual script for verifying service health and end-to-end ingestion.

#### Data Models (`models/schema.py`)
- `SceneLine`, `ScenePackage`, `EvaluationResult` — Pydantic models with optional phoneme/pitch placeholders.

#### Frontend (Next.js 16 + Tailwind CSS 4)
- **Roleplay Experience:**
  - `page.tsx` — Orchestrates roleplay state via sync-ref pattern for low-latency synchronization.
  - `VideoPlayer.tsx` — Wrapped `react-player` with `onTimeUpdate` synchronization.
  - `RoleplayControls.tsx` — Start/Finish/Evaluate flow controls.
  - `ScriptSelector.tsx` — Dynamic script view with auto-scroll and active line highlighting.
  - `Recorder.tsx` & `EvaluationPanel.tsx` — Audio capture and results display.

### 🚧 Partially Implemented / TODO
- **Phonemes & pitch:** Schema fields exist; extraction/scoring logic pending.
- **Redis:** Rate limiting currently in-memory; transition to Redis planned for persistence.
- **Unit tests:** Backend and frontend test coverage needed.

---

## File Structure & Actual Paths

```
d:\Sutorii\
├── backend\
│   ├── .env
│   ├── requirements.txt
│   ├── diagnose_pipeline.py          # Manual service & pipeline diagnostics
│   └── app\
│       ├── app.py
│       ├── config\
│       │   └── config.py             # Startup health checks
│       ├── models\
│       │   └── schema.py
│       ├── services\
│       │   ├── whisper.py            # Hybrid Whisper/WhisperX
│       │   ├── whisperX_client.py    # Colab Diarization service
│       │   ├── gpt.py
│       │   ├── storage.py
│       │   └── evaluation\
│       └── workers\
│           ├── ingest.py
│           └── evaluate.py
│
└── frontend\
    ├── app\
    │   └── page.tsx                  # Roleplay orchestration
    └── components\
        ├── VideoPlayer.tsx           # Sync-aware player
        ├── RoleplayControls.tsx
        ├── ScriptSelector.tsx        # Highlighted/Auto-scrolling script
        ├── Recorder.tsx
        └── EvaluationPanel.tsx
```

---

## API Endpoints

### `GET /health`
- Returns `{"status": "online"}`. Backend also logs service connectivity on startup.

### `POST /ingest`
- **Body:** `{"youtube_url": "..."}`.
- **Returns:** Full `ScenePackage`.

### `POST /evaluate`
- **Content-Type:** `multipart/form-data`.
- **Returns:** `EvaluationResult` with scores and AI feedback.

---

## Known Issues / Roadmap

1. **Persistence:** Rate limits reset on server restart.
2. **Analysis:** Phoneme and pitch analysis logic remains a placeholder.
3. **Connectivity:** Colab WhisperX service requires active ngrok tunnel; backend falls back gracefully to OpenAI but loses diarization.
