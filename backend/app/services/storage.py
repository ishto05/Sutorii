from supabase import create_client
from app.config.config import settings
import uuid
import os

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def upload_audio(file_path: str) -> str:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    file_name = f"audio/{uuid.uuid4()}.mp3"

    try:
        with open(file_path, "rb") as f:
            supabase.storage.from_(settings.SUPABASE_BUCKET).upload(
                file_name, f, {"content-type": "audio/mpeg"}
            )
    except Exception as e:
        raise RuntimeError(f"Failed to upload audio to Supabase: {str(e)}") from e

    return file_name
