import sys
import os
from pathlib import Path

# Add the project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent))

from app.workers.ingest import ingest_scene
from app.config.config import settings


def check_services():
    print("\n" + "=" * 50)
    print("🔍 MANUAL SERVICE DIAGNOSTICS")
    print("=" * 50)

    # 1. Supabase
    print("\n[1/3] Checking Supabase...")
    if settings.supabase:
        try:
            buckets = settings.supabase.storage.list_buckets()
            print(f"✅ Supabase connected. Found {len(buckets)} buckets.")
        except Exception as e:
            print(f"❌ Supabase query failed: {e}")
    else:
        print("❌ Supabase client not initialized.")

    # 2. OpenAI
    print("\n[2/3] Checking OpenAI...")
    if settings.openai_client:
        try:
            # Simple list models call to verify API key
            settings.openai_client.models.list()
            print("✅ OpenAI API key is valid and service is reachable.")
        except Exception as e:
            print(f"❌ OpenAI authentication/connection failed: {e}")
    else:
        print("⚠️  OpenAI client not initialized (check AI_ENABLED or API key).")

    # 3. WhisperX (Colab)
    print("\n[3/3] Checking Colab WhisperX...")
    try:
        from app.services.whisperX_client import check_colab_health
        health = check_colab_health()
        print(f"✅ WhisperX Colab is ONLINE (status: {health.get('status')})")
    except Exception as e:
        print(f"⚠️  WhisperX Colab check failed: {e}")
        print("   (This is OK if you are using OpenAI fallback, but diarization will be unavailable)")

    print("\n" + "=" * 50)


def test_pipeline():
    print("\n🚀 STARTING FULL PIPELINE TEST")
    print("=" * 50)
    
    # Using a very short and reliable video for testing
    test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    try:
        scene = ingest_scene(test_url)
        print("\n🏆 PIPELINE SUCCESS!")
        print(f"Scene ID: {scene.sceneId}")
        print(f"Lines Generated: {len(scene.script)}")
        for line in scene.script[:2]:
            print(f" - [{line.startTime}-{line.endTime}] {line.speaker}: {line.text}")

    except Exception as e:
        print(f"\n❌ PIPELINE FAILED: {e}")
    
    print("=" * 50 + "\n")


if __name__ == "__main__":
    check_services()
    
    answer = input("\nDo you want to run the full ingestion pipeline test? (y/n): ")
    if answer.lower() == 'y':
        test_pipeline()
