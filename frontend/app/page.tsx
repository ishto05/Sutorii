"use client";

import { useCallback, useRef, useState } from "react";
import { ingestScene, evaluateLine } from "@/lib/api";

import IngestForm from "@/components/IngestForm";
import VideoPlayer, { VideoHandle } from "@/components/VideoPlayer";
import ScriptPanel from "@/components/ScriptSelector";
import Recorder from "@/components/Recorder";
import RoleplayControls from "@/components/RoleplayControls";
import EvaluationPanel from "@/components/EvaluationPanel";

// ─── Types ────────────────────────────────────────────────────────────────────
type SceneLine = {
  id: string;
  speaker: "NPC" | "USER";
  text: string;
  startTime: number;
  endTime: number;
};

type ScenePackage = {
  sceneId: string;
  language: string;
  source: {
    youtube_url?: string;
    url?: string;
    [key: string]: any;
  };
  audio: any;
  script: SceneLine[];
  metadata: any;
};

type Recording = {
  lineId: string;
  blob: Blob;
};

type EvaluationResult = {
  evaluationId: string;
  sceneId: string;
  lineId: string;
  transcript: string;
  scores: { overall: number };
  wordScores: any[];
  feedback: { summary: string };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the video URL from the scene package source field.
 * Adjust this if your backend uses a different shape.
 */
function extractVideoUrl(source: ScenePackage["source"]): string | null {
  return source?.url || source?.youtube_url || null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Page() {
  // ── Scene data ──────────────────────────────────────────────────────────────
  const [scenePackage, setScenePackage] = useState<ScenePackage | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);

  // ── Phase-2A state (exact shape from the design doc) ────────────────────────
  const [roleplayActive, setRoleplayActive] = useState(false);
  const [isPausedForRecording, setIsPausedForRecording] = useState(false);
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [sceneEnded, setSceneEnded] = useState(false);

  // ── Evaluation state ─────────────────────────────────────────────────────────
  const [evaluationStarted, setEvaluationStarted] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResult[]>([]);

  // ── Video player ref (imperative API) ────────────────────────────────────────
  const playerRef = useRef<VideoHandle>(null);

  // ── Playing flag (drives ReactPlayer `playing` prop) ─────────────────────────
  const [playing, setPlaying] = useState(false);

  // ── Guard: prevent pause from firing multiple times per USER line ─────────────
  const pauseFiredRef = useRef(false);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const userLines = scenePackage?.script.filter((l) => l.speaker === "USER") ?? [];
  const videoUrl = scenePackage ? extractVideoUrl(scenePackage.source) : null;

  // Build lookup: lineId → expected text (for EvaluationPanel)
  const expectedTexts: Record<string, string> = {};
  userLines.forEach((l) => {
    expectedTexts[l.id] = l.text;
  });

  // ─── Ingest handler ─────────────────────────────────────────────────────────
  async function handleIngest(url: string) {
    setIngestLoading(true);
    // Reset all state when ingesting a new scene
    setScenePackage(null);
    setRoleplayActive(false);
    setIsPausedForRecording(false);
    setCurrentUserIndex(0);
    setRecordings([]);
    setSceneEnded(false);
    setEvaluationStarted(false);
    setEvaluationResults([]);
    setPlaying(false);
    console.log("Clean URL:", url);

    const scene = await ingestScene(url);
    console.log("source field:", scene.source);

    if (!scene || !Array.isArray(scene.script)) {
      console.error("Invalid ScenePackage:", scene);
      setIngestLoading(false);
      return;
    }

    setScenePackage(scene);
    setIngestLoading(false);
  }

  // ─── Start Roleplay ──────────────────────────────────────────────────────────
  function handleStartRoleplay() {
    if (!scenePackage || userLines.length === 0) return;
    pauseFiredRef.current = false;
    setCurrentUserIndex(0);
    setRecordings([]);
    setSceneEnded(false);
    setEvaluationResults([]);
    setRoleplayActive(true);
    setPlaying(true);           // video starts playing
  }

  // ─── Sync Controller ─────────────────────────────────────────────────────────
  /**
   * Called by VideoPlayer every 200 ms with the current playback time.
   * This is the heart of Phase-2A.
   *
   * Rules:
   * - Only active when roleplayActive = true
   * - Only fires pause once per USER line (pauseFiredRef guard)
   * - Does nothing if already paused for recording
   */
  const handleVideoProgress = useCallback(
    (currentTime: number) => {
      if (!roleplayActive) return;
      if (isPausedForRecording) return;

      const targetLine = userLines[currentUserIndex];
      if (!targetLine) return;                          // all USER lines done

      if (currentTime >= targetLine.startTime && !pauseFiredRef.current) {
        pauseFiredRef.current = true;                  // prevent double-fire
        setPlaying(false);                             // pause the video
        setIsPausedForRecording(true);                 // enable recorder
      }
    },
    [roleplayActive, isPausedForRecording, currentUserIndex, userLines]
  );

  // ─── Video ended ─────────────────────────────────────────────────────────────
  function handleVideoEnded() {
    setRoleplayActive(false);
    setIsPausedForRecording(false);
    setPlaying(false);
    setSceneEnded(true);
  }

  // ─── Recording stopped → store blob, advance, resume ─────────────────────────
  /**
   * Called by Recorder with the finished blob.
   * Order matters here (from the design doc):
   * 1. Store blob
   * 2. Disable recorder (isPausedForRecording = false)
   * 3. Advance index
   * 4. Reset pause guard
   * 5. Resume video
   */
  function handleRecordingStop(blob: Blob) {
    const targetLine = userLines[currentUserIndex];
    if (!targetLine) return;

    // 1. Store
    setRecordings((prev) => [
      ...prev,
      { lineId: targetLine.id, blob },
    ]);

    // 2. Disable recorder
    setIsPausedForRecording(false);

    // 3. Advance index
    const nextIndex = currentUserIndex + 1;
    setCurrentUserIndex(nextIndex);

    // 4. Reset guard for next USER line
    pauseFiredRef.current = false;

    // 5. Resume — if there are more USER lines or video hasn't ended
    setPlaying(true);
  }

  // ─── Batch Evaluation ────────────────────────────────────────────────────────
  /**
   * Sequential calls to /evaluate for each stored recording.
   * Backend is unchanged — we just loop.
   */
  async function handleFinish() {
    if (!scenePackage || recordings.length === 0) return;
    setEvaluationStarted(true);

    const results: EvaluationResult[] = [];

    for (const recording of recordings) {
      const expectedLine = userLines.find((l) => l.id === recording.lineId);
      if (!expectedLine) continue;

      try {
        const result = await evaluateLine({
          sceneId: scenePackage.sceneId,
          lineId: recording.lineId,
          expectedText: expectedLine.text,
          audioBlob: recording.blob,
        });
        results.push(result);
      } catch (err) {
        console.error(`Evaluation failed for line ${recording.lineId}:`, err);
        // MVP: ignore failures, continue to next
      }
    }

    setEvaluationResults(results);
    setEvaluationStarted(false);   // spinner off, results are shown
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex h-screen p-4 gap-6">

      {/* ── Left: Ingest panel ─────────────────────────────────────────────── */}
      <div className="w-80 flex-none border-r border-gray-200 pr-4 overflow-y-auto">
        <h2 className="mb-4 text-xl font-bold">Sutorii</h2>
        <IngestForm onSubmit={handleIngest} loading={ingestLoading} />

        {/* Debug: scene metadata */}
        {scenePackage && (
          <div className="mt-4 text-xs text-gray-400">
            <p>Scene: <span className="font-mono">{scenePackage.sceneId.slice(0, 8)}…</span></p>
            <p>Lines: {scenePackage.script.length} ({userLines.length} USER)</p>
            <p>Recordings buffered: {recordings.length}</p>
          </div>
        )}
      </div>

      {/* ── Right: Main content ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {scenePackage ? (
          <>
            {/* ── Video player ───────────────────────────────────────────── */}
            {videoUrl ? (
              <div className="flex-none">
                <VideoPlayer
                  ref={playerRef}
                  url={videoUrl}
                  playing={playing}
                  onProgress={handleVideoProgress}
                  onEnded={handleVideoEnded}
                />

                {/* "Your turn" overlay — shown when paused for recording */}
                {isPausedForRecording && (
                  <div className="mt-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded flex items-center gap-3">
                    <span className="text-amber-600 font-semibold text-sm">
                      🎙 Your turn — record your line below
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-none p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
                ⚠ No video URL found in scene source. Check <code>source.youtube_url</code> or <code>source.url</code>.
              </div>
            )}

            {/* ── Controls row ───────────────────────────────────────────── */}
            <div className="flex-none items-center gap-4 flex-wrap">
              <RoleplayControls
                roleplayActive={roleplayActive}
                sceneEnded={sceneEnded}
                evaluationStarted={evaluationStarted}
                recordingCount={recordings.length}
                onStart={handleStartRoleplay}
                onFinish={handleFinish}
              />

              {/* Recorder — only shown when paused for recording */}
              {isPausedForRecording && (
                <Recorder
                  enabled={isPausedForRecording}
                  onStop={handleRecordingStop}
                />
              )}

              {/* ── Script + results ────────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-4 pb-4">
                <ScriptPanel
                  script={scenePackage.script}
                  currentUserIndex={currentUserIndex}
                  roleplayActive={roleplayActive}
                  isPausedForRecording={isPausedForRecording}
                />

                {/* Evaluation results (batch) */}
                {evaluationResults.length > 0 && (
                  <EvaluationPanel
                    results={evaluationResults}
                    expectedTexts={expectedTexts}
                  />
                )}

                {/* Raw JSON — MVP transparency, matches Phase-1 pattern */}
                <details className="mt-2">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    Scene JSON
                  </summary>
                  <pre className="mt-1 text-xs whitespace-pre-wrap font-mono text-gray-500 bg-gray-50 p-3 rounded border border-gray-100 overflow-x-auto">
                    {JSON.stringify(scenePackage, null, 2)}
                  </pre>
                </details>
              </div>
            </div>

          </>
        ) : (
          /* ── Empty state ─────────────────────────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded border border-dashed border-gray-300">
            <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            <p className="font-medium text-sm">Ingest a YouTube video to begin</p>
          </div>
        )}
      </div>
    </main>
  );
}
