"use client";

import { useState } from "react";
import { ingestScene, evaluateLine } from "@/lib/api";
import IngestForm from "@/components/IngestForm";
import ScriptSelector from "@/components/ScriptSelector";
import Recorder from "@/components/Recorder";
import EvaluationPanel from "@/components/EvaluationPanel";

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
  source: any;
  audio: any;
  script: SceneLine[];
  metadata: any;
};

type EvaluationResult = {
  evaluationId: string;
  sceneId: string;
  lineId: string;
  transcript: string;
  scores: {
    overall: number;
  };
  wordScores: any[];
  feedback: {
    summary: string;
  };
};

export default function Page() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [scenePackage, setScenePackage] = useState<ScenePackage | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const userLines =
    scenePackage?.script?.filter((l) => l.speaker === "USER") ?? [];


  const activeLine = userLines.find((l) => l.id === activeLineId);

  async function handleIngest(url: string) {
    setLoading(true);

    const scene = await ingestScene(url);

    if (!scene || !Array.isArray(scene.script)) {
      console.error("Invalid ScenePackage:", scene);
      setLoading(false);
      return;
    }

    setScenePackage(scene);

    setActiveLineId(
      scene.script.find((l: SceneLine) => l.speaker === "USER")?.id ?? null
    );

    setLoading(false);
  }


  async function handleEvaluate() {
    if (!audioBlob || !activeLine || !scenePackage) return;

    setLoading(true);
    const result = await evaluateLine({
      sceneId: scenePackage.sceneId,
      lineId: activeLine.id,
      expectedText: activeLine.text,
      audioBlob,
    });
    setEvaluationResult(result);
    setLoading(false);
  }

  return (
    <main className="flex h-screen p-4 gap-8">
      {/* Left Side: Link Drop Area */}
      <div className="w-80 flex-none border-r border-gray-200 pr-4">
        <h2 className="mb-4 text-2xl font-bold">Ingest</h2>
        <IngestForm onSubmit={handleIngest} loading={loading} />
      </div>

      {/* Right Side: Script and Data */}
      <div className="flex-1 flex flex-col overflow-hidden gap-4">
        {scenePackage ? (
          <>
            {/* Top Part: Script from ScenePackage */}
            <div className="flex-1 overflow-y-auto pb-4 custom-scrollbar">
              <div className="mb-4">
                <h3 className="text-xl font-semibold mb-2">Script</h3>

                {scenePackage.script.map((line) => (
                  <div
                    key={line.id}
                    onClick={() =>
                      line.speaker === "USER" && setActiveLineId(line.id)
                    }
                    className={`
                      ${line.speaker === "USER" ? "cursor-pointer font-bold" : "cursor-default font-normal"}
                      ${activeLineId && line.id !== activeLineId ? "opacity-60" : "opacity-100"}
                      mb-1 px-2 py-1 rounded transition-colors
                      ${activeLineId === line.id ? "bg-gray-10" : "bg-transparent hover:bg-gray-50"}
                    `}
                  >
                    <span className={`${line.speaker === "USER" ? "text-blue-600" : "text-gray-200"} font-medium mr-2`}>
                      [{line.speaker}]
                    </span>
                    {line.text}
                  </div>
                ))}
              </div>

              <Recorder onRecorded={setAudioBlob} />

              {audioBlob && (
                <div className="my-4 p-4 bg-gray-50 rounded border border-gray-100">
                  <p className="font-bold text-sm mb-2 text-gray-600">Recorded Audio Preview</p>
                  <audio
                    controls
                    src={URL.createObjectURL(audioBlob)}
                    className="w-full"
                  />
                </div>
              )}

              <div className="mt-4">
                <button
                  onClick={handleEvaluate}
                  disabled={!audioBlob || !activeLine}
                  className={`
                    px-6 py-2 rounded font-medium text-white transition-all shadow-sm
                    ${(!audioBlob || !activeLine)
                      ? "bg-blue-300 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 cursor-pointer hover:shadow-md"}
                  `}
                >
                  Evaluate Line
                </button>
              </div>

              <EvaluationPanel result={evaluationResult} />
            </div>

            {/* Bottom Part: Actual JSON Response */}
            <div className="flex-1 border-t border-gray-200 pt-4 overflow-y-auto bg-gray-50 p-4 rounded shadow-inner">
              <h4 className="mt-0 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Scene Data (JSON)</h4>
              <pre className="text-xs whitespace-pre-wrap font-mono text-gray-700">
                {JSON.stringify(scenePackage, null, 2)}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 bg-gray-50 rounded border border-dashed border-gray-300 m-2">
            <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            <p className="font-medium">Please ingest a YouTube video to view the scene content.</p>
          </div>
        )}
      </div>
    </main>
  );
}
