# Sutorii Project Architecture

This document provides a comprehensive overview of the Sutorii codebase layout, technologies, data flow, and architecture to help AI models quickly understand the project context.

## 1. High-Level Overview
**Sutorii** is an interactive Japanese language learning application. It ingests YouTube videos, uses AI to create a structured dialogue script with speaker diarization and furigana, and provides a roleplay mode. In roleplay mode, users select a character, and the video pauses when it is their turn to speak. The user records their pronunciation, which is then scored and evaluated by AI for feedback.

### Tech Stack
- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Zustand (State Management), shadcn/ui.
- **Backend:** Python, FastAPI, Uvicorn, Pydantic.
- **AI/Audio Processing:** yt-dlp, FFmpeg, WhisperX (via Colab API), OpenAI (Whisper and GPT-4o-mini), Azure (Pronunciation - partially integrated).
- **Storage:** Supabase Storage.

---

## 2. Directory Structure

```text
d:\Sutorii\
├── backend\
│   ├── app.py                     # FastAPI entry point (/ingest, /evaluate, /health)
│   ├── requirements.txt           # Python dependencies
│   ├── diagnose_pipeline.py       # Diagnostic script for pipeline steps
│   ├── config/
│   │   └── config.py              # Environment variables and API client initialization
│   ├── models/
│   │   └── schema.py              # Pydantic schemas (SceneLine, ScenePackage, EvaluationResult)
│   ├── services/                  # Core domain logic
│   │   ├── azure_pronunciation.py # Azure TTS/Pronunciation
│   │   ├── characterID_client.py  # Character identification
│   │   ├── evaluation/            # Scoring algorithms and normalization
│   │   ├── gpt.py                 # OpenAI GPT hooks (script refinement, feedback)
│   │   ├── pitch.py / pitch_cache.py / pitch_compare.py # Pitch accent logic
│   │   ├── rate_limit.py          # In-memory rate limiting
│   │   ├── storage.py             # Supabase storage interactions
│   │   ├── subtitles.py           # Subtitle parsing (vtt/srt)
│   │   ├── whisper.py             # OpenAI Whisper client
│   │   └── whisperX_client.py     # Colab-hosted WhisperX diarization integration
│   └── workers/
│       ├── ingest.py              # 5-phase video ingestion worker (DL -> transcribe -> refine -> ... )
│       └── evaluate.py            # User audio evaluation pipeline
│
├── frontend\
│   ├── package.json
│   ├── tsconfig.json
│   ├── app/
│   │   ├── layout.tsx             # Root layout wrapping
│   │   ├── page.tsx               # Main entry or redirect
│   │   ├── play/                  # The actual roleplay phase
│   │   ├── results/               # Results and feedback display phase
│   │   └── setup/                 # Pre-roleplay configuration (language settings, character select)
│   ├── components/                # UI Components
│   │   ├── EvaluationPanel.tsx    # Displays evaluation results/GPT feedback
│   │   ├── Recorder.tsx           # Audio recording interface
│   │   ├── RoleplayControls.tsx   # Generic controls for the flow
│   │   ├── ScriptSelector.tsx     # The scrolling script view UI
│   │   └── VideoPlayer.tsx        # react-player wrapper, syncs video time to the script
│   ├── lib/                       # API clients and utilities for frontend
│   └── store/
│       └── sutorii.ts             # Zustand global state (AppPhase, ScenePackage, Recordings)
└── PROGRESS.md                    # Manual high-level progress tracking
```

---

## 3. Data Flow

### 3.1. Ingestion Pipeline (`POST /ingest` -> `workers/ingest.py`)
1. **Download:** Triggered with a YouTube URL. `yt-dlp` extracts the audio, `ffmpeg` transcodes to MP3 and enforces a duration limit.
2. **Transcription/Diarization:** Sends the audio through WhisperX (via external Colab API) for accurate speaker segments (e.g., SPEAKER_00, SPEAKER_01). Falls back to standard OpenAI Whisper if unavailable.
3. **Refinement:** Sends chunks to GPT-4o-mini structured outputs to clean text, merge broken segments, and append furigana to kanji characters.
4. **Assembly:** Assembles `SceneLine`s into a `ScenePackage` and uploads audio/metadata to Supabase Storage. Returns the `ScenePackage` to frontend.

### 3.2. Roleplay Mode (Frontend: `store/sutorii.ts` & `app/play/page.tsx`)
1. **State:** The `ScenePackage` is stored in Zustand (`useSutoriiStore`). User picks a character inside `app/setup`.
2. **Sync Loop:** `VideoPlayer.tsx` plays the video and calls `onTimeUpdate`. The frontend cross-references the current video time against the script's `startTime` and `endTime`.
3. **Pausing:** When the time enters a `SceneLine` owned by the `selectedCharacter`, the video auto-pauses. The `Recorder.tsx` mounts, capturing the user's mic input.
4. **Advancing:** The user stops recording, the audio Blob is saved to Zustand (`recordings`), and video resumes.

### 3.3. Evaluation Pipeline (`POST /evaluate` -> `workers/evaluate.py`)
1. After the roleplay scene concludes, the frontend submits the user's audio blobs mapping to the corresponding `lineId`.
2. Backend receives the audio file, passes it to Whisper for user transcription.
3. Calculates text similarity (Character Error Rate / Edit Distance) against the expected line. Let's say expected is `"元気ですか"` and user said `"げんきですか"`. Normalization layers standardize text to pure kana for comparison.
4. Uses GPT-4o-mini to generate an encouraging `feedback` string and specific `tips`. Returns `EvaluationResult`.
5. Frontend mounts `EvaluationPanel.tsx` in `app/results` to show the grade.

---

## 4. Key Models / Interfaces

### Backend (Pydantic schemas in `schema.py`)
- `SceneLine`: `{id, characterName, text, phoneticReading, transliteration, startTime, endTime, words, ...}`
- `ScenePackage`: `{sceneId, source, audio, script: List[SceneLine], ...}`
- `EvaluationResult`: `{score_out_of_100, user_text, differences, feedback, ...}`

### Frontend (Zustand in `sutorii.ts`)
- `AppPhase`: Idle -> Ingesting -> Character Select -> Ready -> Roleplay -> Evaluated.
- `Recordings`: `{lineId, blob}`.

## 5. System Design Anti-Patterns / Notes to Model
- The Zustand store relies heavily on sessionStorage to persist data across Next.js navigation (e.g., from `/setup` to `/play` to `/results`), **except for `Blob` recordings**. Blobs aren't serializable.
- AI transcription utilizes fallback structures: if the Colab endpoint is offline, it drops diarization and defaults to OpenAI.
- Real-time reactivity in `play` mode depends heavily on component memoization and polling video `currentTime` through React Refs to avoid excessive re-tenders.
