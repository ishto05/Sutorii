import os
import sys
from pathlib import Path

# Add the project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.workers.ingest import ingest_scene
from app.config.config import settings


def final_test():
    print("--- Final Pipeline Test ---")
    print(f"AI_ENABLED: {settings.AI_ENABLED}")
    print(f"IS_AI_READY: {settings.is_ai_ready}")

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


if __name__ == "__main__":
    final_test()
