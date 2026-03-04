"use client";

import { useRef, useState, useMemo, useEffect } from "react";
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
  source: { youtube_url?: string; url?: string;[key: string]: any };
  audio: any;
  script: SceneLine[];
  metadata: any;
};

type Recording = { lineId: string; blob: Blob };

type EvaluationResult = {
  evaluationId: string;
  sceneId: string;
  lineId: string;
  transcript: string;
  scores: { overall: number };
  wordScores: any[];
  feedback: { summary: string };
};

function extractVideoUrl(source: ScenePackage["source"]): string | null {
  return source?.url || source?.youtube_url || null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Page() {
  // ── React state (drives UI rendering) ───────────────────────────────────────
  const [scenePackage, setScenePackage] = useState<ScenePackage | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [roleplayActive, setRoleplayActive] = useState(false);
  const [isPausedForRecording, setIsPausedForRecording] = useState(false);
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [sceneEnded, setSceneEnded] = useState(false);
  const [evaluationStarted, setEvaluationStarted] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState<EvaluationResult[]>([]);
  const [playing, setPlaying] = useState(false);

  // ── Refs (live values readable inside onTimeUpdate without stale closures) ───
  // React state updates are async — by the time onTimeUpdate fires from the
  // YouTube iframe, a setState call may not have propagated yet. Refs are
  // always synchronously up-to-date.
  const roleplayActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentIndexRef = useRef(0);
  const userLinesRef = useRef<SceneLine[]>([]);
  const pauseFiredRef = useRef(false);

  const playerRef = useRef<VideoHandle>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const userLines = useMemo(
    () => scenePackage?.script.filter((l) => l.speaker === "USER") ?? [],
    [scenePackage]
  );

  // Keep userLinesRef in sync whenever userLines changes
  useEffect(() => { userLinesRef.current = userLines; }, [userLines]);

  const videoUrl = useMemo(
    () => (scenePackage ? extractVideoUrl(scenePackage.source) : null),
    [scenePackage]
  );

  const expectedTexts = useMemo(() => {
    const m: Record<string, string> = {};
    userLines.forEach((l) => { m[l.id] = l.text; });
    return m;
  }, [userLines]);

  // ── Helpers: set state AND ref together so they're always in sync ────────────
  function setRoleplayActiveSync(v: boolean) {
    roleplayActiveRef.current = v;
    setRoleplayActive(v);
  }
  function setIsPausedSync(v: boolean) {
    isPausedRef.current = v;
    setIsPausedForRecording(v);
  }
  function setCurrentIndexSync(v: number) {
    currentIndexRef.current = v;
    setCurrentUserIndex(v);
  }

  // ── Ingest ───────────────────────────────────────────────────────────────────
  async function handleIngest(url: string) {
    setIngestLoading(true);
    setScenePackage(null);
    setRoleplayActiveSync(false);
    setIsPausedSync(false);
    setCurrentIndexSync(0);
    setRecordings([]);
    setSceneEnded(false);
    setEvaluationStarted(false);
    setEvaluationResults([]);
    setPlaying(false);
    pauseFiredRef.current = false;

    const scene = await ingestScene(url);
    console.log("[Ingest] source:", scene?.source);

    if (!scene || !Array.isArray(scene.script)) {
      console.error("[Ingest] Invalid ScenePackage:", scene);
      setIngestLoading(false);
      return;
    }
    setScenePackage(scene);
    setIngestLoading(false);
  }

  // ── Start roleplay ───────────────────────────────────────────────────────────
  function handleStartRoleplay() {
    if (!scenePackage || userLines.length === 0) return;

    pauseFiredRef.current = false;
    setCurrentIndexSync(0);
    setRecordings([]);
    setSceneEnded(false);
    setEvaluationResults([]);
    setIsPausedSync(false);

    // Set ref BEFORE setPlaying so the very first onTimeUpdate tick
    // already sees roleplayActive = true
    setRoleplayActiveSync(true);
    setPlaying(true);

    console.log(
      "[Roleplay] Started. Watching cues:",
      userLines.map((l) => `${l.id} @ ${l.startTime}s`)
    );
  }

  // ── Sync controller — reads ONLY from refs, never from state ────────────────
  // This function is stable (no deps) because refs give us live values.
  // If we used state here via useCallback deps, we'd get stale closures:
  // the iframe fires onTimeUpdate before React flushes the state update.
  function handleTimeUpdate(currentTime: number) {
    if (!roleplayActiveRef.current || isPausedRef.current) return;

    const targetLine = userLinesRef.current[currentIndexRef.current];
    if (!targetLine) return;

    if (currentTime >= targetLine.startTime && !pauseFiredRef.current) {
      console.log(
        `[Sync] ✓ Pausing at ${currentTime.toFixed(2)}s ` +
        `for "${targetLine.id}" (cue: ${targetLine.startTime}s)`
      );
      pauseFiredRef.current = true;
      setIsPausedSync(true);
      setPlaying(false);
    }
  }

  // ── Video ended ──────────────────────────────────────────────────────────────
  function handleVideoEnded() {
    setRoleplayActiveSync(false);
    setIsPausedSync(false);
    setPlaying(false);
    setSceneEnded(true);
    console.log("[Roleplay] Video ended");
  }

  // ── Recording done → store blob, advance index, resume ──────────────────────
  function handleRecordingStop(blob: Blob) {
    const targetLine = userLinesRef.current[currentIndexRef.current];
    if (!targetLine) return;

    setRecordings((prev) => [...prev, { lineId: targetLine.id, blob }]);

    const next = currentIndexRef.current + 1;
    setCurrentIndexSync(next);
    setIsPausedSync(false);
    pauseFiredRef.current = false;
    setPlaying(true);

    console.log(`[Sync] Saved recording for "${targetLine.id}", resuming. Next index: ${next}`);
  }

  // ── Batch evaluation ─────────────────────────────────────────────────────────
  async function handleFinish() {
    if (!scenePackage || recordings.length === 0) return;
    setEvaluationStarted(true);
    const results: EvaluationResult[] = [];
    for (const rec of recordings) {
      const line = userLines.find((l) => l.id === rec.lineId);
      if (!line) continue;
      try {
        const result = await evaluateLine({
          sceneId: scenePackage.sceneId,
          lineId: rec.lineId,
          expectedText: line.text,
          audioBlob: rec.blob,
        });
        results.push(result);
      } catch (err) {
        console.error(`[Eval] Failed for ${rec.lineId}:`, err);
      }
    }
    setEvaluationResults(results);
    setEvaluationStarted(false);
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">

      {/* ── Col 1: Ingest sidebar ─────────────────────────────────────────── */}
      <aside className="w-72 flex-none flex flex-col border-r border-gray-800 bg-gray-900 overflow-y-auto">
        <div className="px-4 pt-5 pb-4 border-b border-gray-800">
          <h1 className="text-lg font-bold tracking-tight text-white">Sutorii</h1>
        </div>
        <div className="px-4 py-4 border-b border-gray-800">
          <IngestForm onSubmit={handleIngest} loading={ingestLoading} />
        </div>
        {scenePackage && (
          <div className="px-4 py-3 text-xs text-gray-500 space-y-1 border-b border-gray-800">
            <p>Scene: <span className="font-mono text-gray-400">{scenePackage.sceneId.slice(0, 8)}…</span></p>
            <p>Lines: <span className="text-gray-400">{scenePackage.script.length}</span> <span className="text-gray-600">({userLines.length} USER)</span></p>
            <p>Buffered: <span className="text-gray-400">{recordings.length}</span> recordings</p>
          </div>
        )}
        {scenePackage && (
          <div className="px-4 py-3 mt-auto">
            <details>
              <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400 select-none">Scene JSON</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap font-mono text-gray-600 max-h-48 overflow-y-auto">
                {JSON.stringify(scenePackage, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </aside>

      {/* ── Col 2: Video + controls ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {scenePackage ? (
          <>
            <div className="flex-none p-4 pb-2">
              {videoUrl ? (
                <VideoPlayer
                  ref={playerRef}
                  url={videoUrl}
                  playing={playing}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={handleVideoEnded}
                />
              ) : (
                <div className="p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-sm text-yellow-400">
                  ⚠ No video URL found in scene source.
                </div>
              )}
            </div>

            {isPausedForRecording && (
              <div className="flex-none mx-4 mb-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
                <span className="text-2xl">🎙</span>
                <div>
                  <p className="text-amber-300 font-semibold text-sm leading-none mb-0.5">Your turn!</p>
                  <p className="text-amber-400/60 text-xs">Record your line, then press Stop</p>
                </div>
              </div>
            )}

            <div className="flex-none px-4 pb-4 flex items-center gap-4 flex-wrap">
              <RoleplayControls
                roleplayActive={roleplayActive}
                sceneEnded={sceneEnded}
                evaluationStarted={evaluationStarted}
                recordingCount={recordings.length}
                onStart={handleStartRoleplay}
                onFinish={handleFinish}
              />
              {isPausedForRecording && (
                <Recorder
                  enabled={isPausedForRecording}
                  onStop={handleRecordingStop}
                />
              )}
            </div>

            {evaluationResults.length > 0 && (
              <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
                <EvaluationPanel results={evaluationResults} expectedTexts={expectedTexts} />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-3">
            <svg className="w-14 h-14 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">Ingest a YouTube video to begin</p>
          </div>
        )}
      </div>

      {/* ── Col 3: Script sidebar ─────────────────────────────────────────── */}
      {scenePackage && (
        <aside className="w-80 flex-none flex flex-col border-l border-gray-800 bg-gray-900">
          <div className="flex-none px-4 pt-4 pb-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white tracking-wide">Script</h2>
            <span className="text-xs text-gray-500 tabular-nums">
              {currentUserIndex} / {userLines.length} lines
            </span>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-1">
            <ScriptPanel
              script={scenePackage.script}
              currentUserIndex={currentUserIndex}
              roleplayActive={roleplayActive}
              isPausedForRecording={isPausedForRecording}
            />
          </div>
        </aside>
      )}
    </main>
  );
}