# Sutorii - Codebase Progress Documentation

**Last Updated:** February 4, 2026
**Project Root:** `d:\Sutorii`

---

## Project Overview

**Sutorii** is a Japanese language learning application backend that processes YouTube videos to create interactive learning scenes. The system extracts audio from YouTube URLs, transcribes it using Whisper AI, refines the dialogue using GPT, and stores the processed content for language learning purposes.

---

## What It Actually Does

### Core Functionality

1. **YouTube Video Ingestion**
   - Accepts YouTube URLs via REST API
   - Downloads and extracts audio from videos
   - Converts audio to MP3 format (optimized for Whisper and storage)

2. **Audio Transcription**
   - Uses OpenAI Whisper API to transcribe Japanese audio
   - Returns transcript text, segments, and duration
   - Currently has mock mode for development (when API keys are missing)

3. **Script Refinement**
   - Uses GPT-4o-mini to clean and structure dialogue
   - Splits dialogue into short lines with strict JSON structure
   - Assigns speaker roles (NPC or USER)
   - Preserves natural Japanese phrasing
   - **Structured Output**: Uses OpenAI `beta.chat.completions.parse` to guarantee Pydantic schema compliance
   - **Normalization**: Post-processing ensures monotonic timestamps and minimum line durations

4. **Storage**
   - Uploads processed audio files to Supabase Storage
   - Stores files in `audio/` bucket with UUID-based naming

5. **Scene Package Creation**
   - Creates structured `ScenePackage` objects containing:
     - Scene ID (UUID)
     - Language (Japanese)
     - Source information (YouTube URL)
     - Audio metadata (storage path, duration, sample rate 16kHz)
     - Script (dialogue lines - fully parsed and structured)
     - Metadata (creation timestamp, version)

6.  **Pronunciation Evaluation**
    -  Accepts user recordings via `/evaluate` API
    -  Transcribes user audio using Whisper
    -  Normalizes text (Unicode NFKC, removes punctuation/readings)
    -  Computes similarity scores (Levenshtein ratio + word-level token matching)
    -  Generates GPT-based feedback improvement tips

7. **Frontend Interface (MVP)**
   -  **Next.js (App Router)** application
   -  **Technology**: Next.js 16, React 19, Tailwind CSS 4
   -  **Split-Pane Layout**: Logic separated into Input (Left) and Output (Right)
   -  **Interactive Script**: Clickable dialogue lines to select context
   -  **Audio Recorder**: Browser-based audio recording for pronunciation testing
   -  **Feedback Display**: Shows evaluation scores and GPT-generated feedback clearly
   -  **Styling**: Full Tailwind CSS (v4) implementation across all components

---

## Current Implementation Status

### ✅ Implemented

#### Backend
- **FastAPI Application** (`app.py`)
  - Health check endpoint (`/health`)
  - Ingest endpoint (`/ingest`) - accepts YouTube URLs
  - Evaluate endpoint (`/evaluate`) - accepts audio upload & expected text
  - Request validation using Pydantic models
  - Error handling with HTTP exceptions
  - CORS Middleware configured

- **YouTube Audio Extraction** (`workers/ingest.py`)
  - Uses `yt-dlp` to download audio
  - Converts to MP3 format using FFmpeg
  - Temporary file management with cleanup
  - **Script Parsing**: Fully implemented structured output parsing from GPT
  - **Normalization**: Timestamp and duration normalization logic

- **Evaluation System** (`workers/evaluate.py`)
  - **Normalization Logic** (`services/evaluation/normalize.py`): Removes kanji readings like `(げんき)`, punctuation, and standardizes whitespace
  - **Scoring Logic** (`services/evaluation/similarity.py`): Hybrid score (Coverage + Edit Distance)
  - **Feedback**: GPT-4o-mini generates one-sentence encouragement + tip

- **Infrastructure Services**
  - **Whisper Integration** (`services/whisper.py`): Verbose JSON segments
  - **GPT Integration** (`services/gpt.py`): Structured Outputs
  - **Supabase Storage** (`services/storage.py`): Audio file management
  - **Configuration** (`config/config.py`): Robust env var handling

#### Frontend
- **Tech Stack**: Next.js 16, React 19, Tailwind CSS 4, TypeScript
- **Components**:
  - `IngestForm`: Handles URL submission
  - `Recorder`: Manages browser microphone access and recording.
  - `EvaluationPanel`: Displays scores and feedback
  - `ScriptSelector`: (Internal component logic integrated into main view)
- **UI UX**:
  - Clean split-view layout (Left: Input, Right: Script+JSON)
  - Responsive alignment (Flexbox)
  - Visual feedback for active lines and recording state
  - Styled with Tailwind utilities (removing inline styles)

### 🚧 Partially Implemented / TODO

- **Redis Integration**: Redis URL configured but not used anywhere.
- **Phonemes & Pitch**: Fields exist in `SceneLine` but not populated (currently handled via simple text similarity).
- **Unit Testing**: No test files found yet.

---

## File Structure & Actual Paths

```
d:\Sutorii\
├── backend\
│   ├── .env
│   ├── requirements.txt
│   │
│   └── app\
│       ├── app.py                    # FastAPI application
│       ├── config\
│       ├── models\
│       ├── services\
│       │   ├── whisper.py
│       │   ├── gpt.py
│       │   ├── storage.py
│       │   └── evaluation\
│       └── workers\
│           ├── ingest.py
│           └── evaluate.py
│
└── frontend\
    ├── app\
    │   ├── globals.css               # Tailwind directives
    │   ├── layout.tsx
    │   └── page.tsx                  # Main application view (Split Layout)
    ├── components\
    │   ├── IngestForm.tsx
    │   ├── Recorder.tsx
    │   ├── EvaluationPanel.tsx
    │   └── ScriptSelector.tsx        # (Active but logic moved to page.tsx)
    ├── package.json
    └── tailwind.config.ts            # (Implicit in v4 via PostCSS/CSS)
```

---

## API Endpoints

### `GET /health`
- **Purpose**: Health check
- **Response**: `{"status": "online"}`

### `POST /ingest`
- **Purpose**: Process a YouTube video into a learning scene
- **Request Body**: `{"youtube_url": "..."}`
- **Response**: `ScenePackage` object (JSON)

### `POST /evaluate`
- **Purpose**: Evaluate user pronunciation against a target line
- **Content-Type**: `multipart/form-data`
- **Form Fields**: `sceneId`, `lineId`, `expectedText`, `audio`
- **Response**: `EvaluationResult` object (JSON)

---

## Known Issues / Notes

1. **Redis**: Configured but not implemented/used.
2. **Phonemes**: `SceneLine.phonemes` and `pitchPattern` are currently null/unused; using text-based evaluation for MVP.
3. **Testing**: No test files found.
4. **Documentation**: `PROGRESS.md` maintained.

---

## Next Steps / Roadmap

1. Add phoneme and pitch pattern extraction (future)
2. Add comprehensive error handling (global exception handler)
3. Add unit tests (Backend & Frontend)
4. Create README.md with setup instructions
