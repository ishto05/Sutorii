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
    COLAB_API_SECRET = os.getenv("COLAB_API_SECRET", "").strip().strip('"')
    COLAB_WHISPERX_URL = os.getenv("COLAB_WHISPERX_URL", "").strip().strip('"')
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
    _whisperX_client = None

    def __init__(self):
        print("\n" + "=" * 50)
        print("STARTING SERVICE CHECKS")
        print("=" * 50)

        # 1. Supabase
        if self.SUPABASE_URL and self.SUPABASE_SERVICE_ROLE_KEY:
            try:
                self.supabase = create_client(
                    self.SUPABASE_URL, self.SUPABASE_SERVICE_ROLE_KEY
                )
                # Test connection
                self.supabase.storage.list_buckets()
                print("✅ [SUPABASE] Connection successful.")
            except Exception as e:
                print(f"❌ [SUPABASE] Initialization failed: {e}")
        else:
            print("⚠️  [SUPABASE] Configuration missing.")

        # 2. OpenAI
        if self.is_ai_ready and self.AI_ENABLED:
            try:
                self._openai_client = OpenAI(api_key=self.OPENAI_API_KEY)
                # Simple check - technically needs a call to verify key, but sticking to init for now
                print("✅ [OPENAI] Client initialized.")
            except Exception as e:
                print(f"❌ [OPENAI] Initialization failed: {e}")
        else:
            status = "MISSING" if not self.OPENAI_API_KEY else "DISABLED"
            print(f"⚠️  [OPENAI] Service is {status}.")

        # 3. Colab WhisperX
        if self.COLAB_WHISPERX_URL:
            try:
                import httpx

                response = httpx.get(
                    f"{self.COLAB_WHISPERX_URL.rstrip('/')}/health", timeout=5
                )
                if response.status_code == 200:
                    print(
                        f"✅ [WHISPERX] Service is ONLINE (status: {response.json().get('status')}, connected to Device: {response.json().get('device')}, GPU: {response.json().get('gpu')}, Model: {response.json().get('model')})"
                    )
                    self._whisperX_client = (
                        self.COLAB_WHISPERX_URL,
                        self.COLAB_API_SECRET,
                    )
                else:
                    print(
                        f"⚠️  [WHISPERX] Service down status code: {response.status_code} | OPENAI WHISPER will process the audio."
                    )
            except Exception as e:
                print(f"⚠️  [WHISPERX] Service unreachable: {e}")
        else:
            print("⚠️  [WHISPERX] Configuration missing.")

        missing = []
        if not self.OPENAI_API_KEY:
            missing.append("OPENAI_API_KEY")
        if not self.SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not self.COLAB_WHISPERX_URL:
            missing.append("COLAB_WHISPERX_URL")

        if missing:
            print("-" * 50)
            print(f"⚠️  MISSING KEYS: {', '.join(missing)}")
            print("⚠️  Mock will be returned.")

        print("=" * 50 + "\n")

    @property
    def is_ai_ready(self) -> bool:
        return bool(self.OPENAI_API_KEY and "sk-" in self.OPENAI_API_KEY)

    @property
    def openai_client(self):
        return self._openai_client


settings = Settings()
