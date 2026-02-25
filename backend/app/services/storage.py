from app.config.config import settings
import uuid
import os


def upload_audio(file_path: str) -> str:
    supabase = settings.supabase
    if not supabase:
        raise RuntimeError("Supabase client not initialized. Check your config.")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    file_name = f"audio/{uuid.uuid4()}.mp3"

    try:
        with open(file_path, "rb") as f:
            supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
                file_name, f, {"content-type": "audio/mpeg"}
            )
        print("✅ Audio uploaded to Supabase successfully.")
    except Exception as e:
        raise RuntimeError(f"Failed to upload audio to Supabase: {str(e)}") from e

    return file_name
