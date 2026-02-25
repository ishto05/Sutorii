import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings:
    PORT = os.getenv("PORT")
    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS").split(",")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET")
    REDIS_URL = os.getenv("REDIS_URL")
    AI_ENABLED = os.getenv("AI_ENABLED", "false").lower() == "true"

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    print(supabase.storage.list_buckets())

    def __init__(self):
        # Instead of crashing, we just print a warning to the console
        missing = []
        if not self.OPENAI_API_KEY:
            missing.append("OPENAI_API_KEY")
        if not self.SUPABASE_URL:
            missing.append("SUPABASE_URL")

        if missing:
            print(
                f"⚠️  DEVELOPMENT WARNING: The following keys are missing: {', '.join(missing)}"
            )
            print(
                "⚠️  The app will run, but real API calls will fail. Use Mocks instead."
            )

    @property
    def is_ai_ready(self) -> bool:
        return bool(self.OPENAI_API_KEY and "sk-" in self.OPENAI_API_KEY)


settings = Settings()
