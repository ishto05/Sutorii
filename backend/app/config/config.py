import os
from openai import OpenAI
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)


class Settings:
    PORT = os.getenv("PORT")
    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS").split(",")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip().strip('"')
    SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().strip('"')
    SUPABASE_SERVICE_ROLE_KEY = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip().strip('"')
    )
    SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "").strip().strip('"')
    REDIS_URL = os.getenv("REDIS_URL")

    _ai_enabled_raw = str(os.getenv("AI_ENABLED", "false")).lower().strip().strip('"')
    AI_ENABLED = _ai_enabled_raw == "true"

    supabase = None
    _openai_client = None

    def __init__(self):
        # Initialize Supabase if values are present
        if self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY:
            try:
                self.supabase = create_client(
                    self.SUPABASE_URL, self.SUPABASE_SERVICE_ROLE_KEY
                )
                print("🔗 Supabase init successful.")
            except Exception as e:
                print(f"⚠️  Supabase init warning: {e}")

        # Initialize OpenAI if key is present
        if self.is_ai_ready and self.AI_ENABLED:
            try:
                self._openai_client = OpenAI(api_key=self.OPENAI_API_KEY)
            except Exception as e:
                print(f"⚠️  OpenAI init warning: {e}")

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

    @property
    def openai_client(self):
        return self._openai_client


settings = Settings()
