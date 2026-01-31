# Sutorii - Codebase Progress Documentation

**Last Updated:** January 28, 2026  
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
   - Returns transcript text and duration
   - Currently has mock mode for development (when API keys are missing)

3. **Script Refinement**
   - Uses GPT-4o-mini to clean and structure dialogue
   - Splits dialogue into short lines
   - Assigns speaker roles (NPC or USER)
   - Preserves natural Japanese phrasing
   - Currently has mock mode for development

4. **Storage**
   - Uploads processed audio files to Supabase Storage
   - Stores files in `Sutorii_transcriptions/` bucket with UUID-based naming

5. **Scene Package Creation**
   - Creates structured `ScenePackage` objects containing:
     - Scene ID (UUID)
     - Language (Japanese)
     - Source information (YouTube URL)
     - Audio metadata (storage path, duration, sample rate 16kHz [hardcoded metadata])
     - Script (dialogue lines - currently mocked)
     - Metadata (creation timestamp, version)

---

## Current Implementation Status

### ✅ Implemented

- **FastAPI Application** (`app.py`)
  - Health check endpoint (`/health`)
  - Ingest endpoint (`/ingest`) - accepts YouTube URLs
  - Request validation using Pydantic models
  - Error handling with HTTP exceptions

- **YouTube Audio Extraction** (`workers/ingest.py`)
  - Uses `yt-dlp` to download audio
  - Converts to MP3 format using FFmpeg
  - Temporary file management with cleanup

- **Whisper Integration** (`services/whisper.py`)
  - OpenAI Whisper API integration
  - Mock mode when API key is missing
  - Returns transcript text and duration

- **GPT Integration** (`services/gpt.py`)
  - GPT-4o-mini for script refinement
  - System prompt for Japanese dialogue cleaning
  - Mock mode when API key is missing

- **Supabase Storage** (`services/storage.py`)
  - Audio file upload to Supabase Storage
  - UUID-based file naming
  - Error handling

- **Configuration Management** (`config/config.py`)
  - Environment variable loading from `.env`
  - Settings class with validation
  - Development-friendly warnings (doesn't crash on missing keys)
  - `is_ai_ready` property to check API availability

- **Data Models** (`models/schema.py`)
  - `SceneLine` - Individual dialogue line with speaker, text, timestamps
  - `ScenePackage` - Complete scene with audio, script, metadata
  - `EvaluationResult` - For future evaluation features (not yet implemented)

### 🚧 Partially Implemented / TODO

- **Script Parsing**: The `refined` script from GPT is not parsed into `SceneLine` objects yet - the `script` field in `ScenePackage` is currently populated with hardcoded mock data in `ingest.py`.
- **Timestamps**: GPT refinement includes timestamps in text format, but they're not extracted and assigned to `SceneLine.startTime` and `endTime`.
- **Evaluation System**: `EvaluationResult` model exists but no endpoints or logic implemented.
- **Redis Integration**: Redis URL configured but not used anywhere.
- **Phonemes & Pitch**: Fields exist in `SceneLine` but not populated.

---

## File Structure & Actual Paths

```
d:\Sutorii\
├── backend\
│   ├── .env                          # Environment variables
│   ├── requierments.txt              # Python dependencies (NOTE: typo in filename)
│   │
│   └── app\
│       ├── app.py                    # FastAPI application entry point
│       │
│       ├── config\
│       │   └── config.py             # Settings and environment configuration
│       │
│       ├── models\
│       │   └── schema.py             # Pydantic data models
│       │
│       ├── services\
│       │   ├── whisper.py            # OpenAI Whisper transcription service
│       │   ├── gpt.py                # OpenAI GPT script refinement service
│       │   └── storage.py            # Supabase storage upload service
│       │
│       └── workers\
│           └── ingest.py             # Main ingestion worker (MP3 conversion)
```

---

## API Endpoints

### `GET /health`
- **Purpose**: Health check
- **Response**: `{"status": "online"}`

### `POST /ingest`
- **Purpose**: Process a YouTube video into a learning scene
- **Request Body**:
  ```json
  {
    "youtube_url": "https://www.youtube.com/watch?v=..."
  }
  ```
- **Response**: `ScenePackage` object (JSON)
- **Error Handling**: Returns 500 with error message on failure

---

## Configuration

### Environment Variables (`.env`)

```env
OPENAI_API_KEY=offline                    # Set to actual key or "offline" for mock mode
SUPABASE_URL=http://localhost:54321      # Supabase instance URL
SUPABASE_SERVICE_ROLE_KEY=offline        # Supabase service role key
SUPABASE_BUCKET=audio                    # Storage bucket name
REDIS_URL=                               # Redis URL (not currently used)
```

### Development Mode

The application runs in **mock mode** when:
- `OPENAI_API_KEY` is missing or doesn't start with "sk-"
- Missing API keys trigger warnings but don't crash the app
- Mock responses are returned for Whisper and GPT services

---

## Dependencies

From `requierments.txt` (note: filename has typo):

```
fastapi
uvicorn
pydantic
python-dotenv
openai
yt-dlp
numpy
python-multipart
supabase
redis
```

---

## Data Flow

```
YouTube URL (POST /ingest)
    ↓
[ingest.py] Download audio with yt-dlp
    ↓
Temporary MP3 file
    ↓
[whisper.py] Transcribe audio → {text, duration}
    ↓
[gpt.py] Refine script → formatted dialogue text
    ↓
[storage.py] Upload MP3 to Supabase → storage path
    ↓
[ingest.py] Create ScenePackage (with mock script currently)
    ↓
Return ScenePackage JSON
```

---

## Known Issues / Notes

1. **Typo**: `requierments.txt` should be `requirements.txt`
2. **Script Parsing**: GPT output needs to be parsed into `SceneLine` objects with proper timestamps. Currently `ingest.py` uses hardcoded mock data.
3. **Redis**: Configured but not implemented/used.
4. **Error Handling**: Basic error handling exists, but could be more granular.
5. **Testing**: No test files found.
6. **Documentation**: No README.md exists.

---

## Next Steps / Roadmap

1. Parse GPT-refined script into `SceneLine` objects - Done
2. Extract timestamps from GPT output and assign to `startTime`/`endTime` - Done
3. Implement evaluation endpoints and logic
4. Add phoneme and pitch pattern extraction
5. Fix typo in `requierments.txt` filename
6. Add comprehensive error handling
7. Add unit tests
8. Create README.md with setup instructions
