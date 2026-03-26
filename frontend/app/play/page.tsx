"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { evaluateSession, SessionEvaluation } from "@/lib/api";
import { useSutoriiStore, useScriptAndCharacter, useSceneSource, usePitchMap } from "@/store/sutorii";

import { AppHeader } from "@/components/AppHeader";
import { SettingsTabs } from "@/components/SettingsTabs";
import VideoPlayer, { VideoHandle } from "@/components/VideoPlayer";
import Recorder from "@/components/Recorder";
import RoleplayControls from "@/components/RoleplayControls";
import WordPanel from "@/components/WordPanel";
import { SpeakerMappingPanel, SpeakerStats } from "@/components/SpeakerMappingPanel";
import ScriptPanel, { WordToken } from "@/components/ScriptSelector";
import EvaluationPanel from "@/components/EvaluationPanel";
import PitchChart from "@/components/PitchChart";

import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

const PITCH_POLL_INTERVAL_MS = 3000;
const PITCH_MAX_ATTEMPTS = 20;

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlayPage() {
    const router = useRouter();

    // ── Store ───────────────────────────────────────────────────────────────────
    const {
        scenePackage,
        appPhase,
        pitchLoading,
        recordings,
        videoTitle,
        translationLanguage,
        nativeLanguage,
        transliterationEnabled,
        speakerMappings,
        setAppPhase,
        setPitchMap,
        setPitchLoading,
        addRecording,
        setRecordings,
        setSessionEvaluation,
        setSpeakerMappings,
        resetRoleplay,
    } = useSutoriiStore();

    const { script, selectedCharacter } = useScriptAndCharacter();
    const source = useSceneSource();
    const pitchMap = usePitchMap();

    // Derive arrays with useMemo — stable references, no infinite loop
    const userLines = useMemo(
        () =>
            script && selectedCharacter
                ? script.filter((l) => l.characterName === selectedCharacter)
                : [],
        [script, selectedCharacter]
    );

    const videoUrl = useMemo(() => {
        if (!source) return null;
        return source.url || source.youtube_url || null;
    }, [source]);

    const enrichedScript = useMemo(() => {
        if (!script) return [];
        return script.map((line) => ({
            ...line,
            pitchPattern: pitchMap[line.id] ?? line.pitchPattern ?? null,
        }));
    }, [script, pitchMap]);

    // Compute per-speaker stats from script for SpeakerMappingPanel
    const speakerStats = useMemo<SpeakerStats[]>(() => {
        if (!scenePackage) return [];
        const map: Record<string, { count: number; total: number; segments: number[] }> = {};
        scenePackage.script.forEach((line) => {
            const dur = (line.endTime ?? 0) - (line.startTime ?? 0);
            if (!map[line.characterName]) map[line.characterName] = { count: 0, total: 0, segments: [] };
            map[line.characterName].count += 1;
            map[line.characterName].total += dur;
            map[line.characterName].segments.push(line.startTime ?? 0);
        });
        return Object.entries(map).map(([id, s]) => ({
            speakerId: id,
            segmentCount: s.count,
            totalDuration: Math.round(s.total),
            avgDuration: s.count > 0 ? Math.round(s.total / s.count) : 0,
            segments: s.segments,
        }));
    }, [scenePackage]);

    const fullVideoPitch = useMemo(() => {
        if (!scenePackage || !pitchMap) return [];
        return scenePackage.script.flatMap(line => pitchMap[line.id] || []);
    }, [scenePackage, pitchMap]);


    // ── Guard: redirect if no scene loaded ──────────────────────────────────────
    useEffect(() => {
        if (!scenePackage || !selectedCharacter) {
            router.replace("/setup");
        }
    }, [scenePackage, selectedCharacter, router]);

    // ── Local UI state ───────────────────────────────────────────────────────────
    const [playing, setPlaying] = useState(false);
    const [isPausedForRecording, setIsPausedForRecording] = useState(false);
    const [currentUserIndex, setCurrentUserIndex] = useState(0);
    const [evaluationStarted, setEvaluationStarted] = useState(false);
    const [activeTab, setActiveTab] = useState("language");
    const [currentTime, setCurrentTime] = useState(0);

    const activeLineId = useMemo(() => {
        if (!enrichedScript || enrichedScript.length === 0) return null;
        const active = enrichedScript.find(
            (line) => currentTime >= (line.startTime ?? 0) && currentTime <= (line.endTime ?? Infinity)
        );
        const id = active?.id ?? null;
        // console.log("[Scripts] Computed activeLineId:", id, "at time:", currentTime);
        return id;
    }, [enrichedScript, currentTime]);

    // Word panel
    const [selectedWord, setSelectedWord] = useState<{
        word: WordToken;
        lineId: string;
        lineText: string;
        characterName: string;
    } | null>(null);

    // Language settings (read-only display in play mode)
    const [pitchEnabled, setPitchEnabled] = useState(false);
    const [pitchSensitivity, setPitchSensitivity] = useState(50);

    // ── Refs (sync controller — avoids stale closures) ──────────────────────────
    const roleplayActiveRef = useRef(false);
    const isPausedRef = useRef(false);
    const currentIndexRef = useRef(0);
    const userLinesRef = useRef(userLines);
    const pauseFiredRef = useRef(false);
    const playerRef = useRef<VideoHandle>(null);
    const pitchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pitchAttemptsRef = useRef(0);

    useEffect(() => { userLinesRef.current = userLines; }, [userLines]);

    // ── Derived ──────────────────────────────────────────────────────────────────
    const expectedTexts = useMemo(() => {
        const m: Record<string, string> = {};
        userLines.forEach((l) => { m[l.id] = l.text; });
        return m;
    }, [userLines]);

    const selectedLinePitch = useMemo(() => {
        if (!selectedWord) return null;
        return pitchMap[selectedWord.lineId] ?? null;
    }, [selectedWord, pitchMap]);

    const masteryPercent = useMemo(() => {
        if (!userLines.length) return 0;
        return Math.round((currentUserIndex / userLines.length) * 100);
    }, [currentUserIndex, userLines.length]);

    // ── Sync helpers ─────────────────────────────────────────────────────────────
    function setRoleplayActiveSync(v: boolean) { roleplayActiveRef.current = v; }
    function setIsPausedSync(v: boolean) { isPausedRef.current = v; setIsPausedForRecording(v); }
    function setCurrentIndexSync(v: number) { currentIndexRef.current = v; setCurrentUserIndex(v); }

    // ── Pitch polling ─────────────────────────────────────────────────────────────
    const stopPitchPolling = useCallback(() => {
        if (pitchPollRef.current) {
            clearInterval(pitchPollRef.current);
            pitchPollRef.current = null;
        }
        setPitchLoading(false);
    }, [setPitchLoading]);

    const startPitchPolling = useCallback((sceneId: string) => {
        pitchAttemptsRef.current = 0;
        setPitchLoading(true);

        pitchPollRef.current = setInterval(async () => {
            pitchAttemptsRef.current += 1;
            if (pitchAttemptsRef.current > PITCH_MAX_ATTEMPTS) {
                stopPitchPolling();
                return;
            }
            try {
                const res = await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/pitch/${sceneId}`
                );
                if (res.status === 202) return;
                if (res.status === 404) { stopPitchPolling(); return; }
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === "ready" && data.lines) {
                        const map: Record<string, number[]> = {};
                        data.lines.forEach((l: any) => { map[l.lineId] = l.pitchPattern; });
                        setPitchMap(map);
                        stopPitchPolling();
                    }
                }
            } catch (err) {
                console.error("[Pitch] Poll error:", err);
            }
        }, PITCH_POLL_INTERVAL_MS);
    }, [setPitchMap, setPitchLoading, stopPitchPolling]);

    // Start pitch polling on mount if not already loaded
    useEffect(() => {
        if (scenePackage && Object.keys(pitchMap).length === 0 && !pitchLoading) {
            startPitchPolling(scenePackage.sceneId);
        }
        return () => stopPitchPolling();
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    // ── Start roleplay ────────────────────────────────────────────────────────────
    function handleStartRoleplay() {
        if (!scenePackage || userLinesRef.current.length === 0) return;
        pauseFiredRef.current = false;
        setCurrentIndexSync(0);
        setRecordings([]);
        setSessionEvaluation(null);
        setIsPausedSync(false);
        setSelectedWord(null);
        setRoleplayActiveSync(true);
        setAppPhase("roleplay");

        // If the very first user line is at 0s, we should stay paused for recording
        const firstLine = userLinesRef.current[0];
        if (firstLine && firstLine.startTime <= 0.1) {
            console.log("[Play] Immediate pause for first line at 0s");
            setIsPausedSync(true);
            setPlaying(false);
            pauseFiredRef.current = true;
        } else {
            setPlaying(true);
        }

        console.log("[Play] Roleplay started as:", selectedCharacter);
    }

    // ── Sync controller ───────────────────────────────────────────────────────────
    function handleTimeUpdate(time: number) {
        setCurrentTime(time);
        
        if (!roleplayActiveRef.current || isPausedRef.current) return;
        const targetLine = userLinesRef.current[currentIndexRef.current];
        if (!targetLine) return;
        if (time >= targetLine.startTime && !pauseFiredRef.current) {
            pauseFiredRef.current = true;
            setIsPausedSync(true);
            setPlaying(false);
        }
    }

    function handleVideoEnded() {
        setRoleplayActiveSync(false);
        setIsPausedSync(false);
        setPlaying(false);
        setAppPhase("ended");
        console.log("[Play] Video ended");
    }

    function handleRecordingStop(blob: Blob) {
        const targetLine = userLinesRef.current[currentIndexRef.current];
        if (!targetLine) return;
        addRecording({ lineId: targetLine.id, blob });
        const next = currentIndexRef.current + 1;
        setCurrentIndexSync(next);
        setIsPausedSync(false);
        pauseFiredRef.current = false;
        setPlaying(true);
    }

    // ── Finish → evaluate session then navigate to /results ──────────────────────
    async function handleFinish() {
        if (!scenePackage || recordings.length === 0) return;
        setEvaluationStarted(true);

        try {
            // Build payload — filter out any recordings whose line can't be found
            const recordingsPayload = recordings
                .map((rec) => {
                    const line = userLines.find((l) => l.id === rec.lineId);
                    if (!line) return null;
                    return {
                        lineId: rec.lineId,
                        expectedText: line.text,
                        audioBlob: rec.blob,
                    };
                })
                .filter(Boolean) as { lineId: string; expectedText: string; audioBlob: Blob }[];

            if (recordingsPayload.length === 0) return;

            const session = await evaluateSession({
                sceneId: scenePackage.sceneId,
                sourceLang: scenePackage.language,   // critical — never hardcode
                recordings: recordingsPayload,
                pitchMap: pitchMap,                // enables DTW pitch scoring
            });

            setSessionEvaluation(session);
            setAppPhase("evaluated");
            router.push("/results");
        } catch (err) {
            console.error("[Eval] Session evaluation failed:", err);
        } finally {
            setEvaluationStarted(false);
        }
    }

    // ── Word panel ────────────────────────────────────────────────────────────────
    function handleWordClick(word: WordToken, lineId: string) {
        const line = enrichedScript.find((l) => l.id === lineId);
        if (!line) return;
        setSelectedWord({ word, lineId, lineText: line.text, characterName: line.characterName });
    }

    async function handleCaptureFrame(startTime: number): Promise<string | null> {
        if (!playerRef.current) return null;
        return playerRef.current.captureFrame(startTime);
    }

    // ─── Render ──────────────────────────────────────────────────────────────────
    const roleplayActive = appPhase === "roleplay";
    const sceneEnded = appPhase === "ended" || appPhase === "evaluated";

    if (!scenePackage || !selectedCharacter) return null;

    return (
        <div className="min-h-screen bg-[#f6f6f8] dark:bg-[#101022] flex flex-col font-sans">

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <AppHeader />

            {/* ── Main ───────────────────────────────────────────────────────────── */}
            <main className="flex-1 mx-auto w-full px-4 lg:px-10 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* ── Left: Video + controls (2/3 width) ───────────────────────── */}
                    <div className="lg:col-span-2 flex flex-col gap-6">

                        {/* ── Actual video player ───────────────────────────────────── */}
                        {videoUrl && (
                            <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 bg-black">
                                <VideoPlayer
                                    ref={playerRef}
                                    url={videoUrl}
                                    playing={playing}
                                    onTimeUpdate={handleTimeUpdate}
                                    onPlay={() => setPlaying(true)}
                                    onPause={() => setPlaying(false)}
                                    onEnded={handleVideoEnded}
                                />
                            </div>
                        )}

                        {/* ── Info card: title + start button + settings tabs ──────────── */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">

                            {/* Title + Start Roleplay row */}
                            <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
                                        {videoTitle || scenePackage.source?.title || scenePackage.sceneId.slice(0, 16) + "…"}
                                    </h1>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div
                                            className="bg-primary h-1.5 rounded-full transition-all"
                                            style={{ width: `${masteryPercent}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">{masteryPercent}% mastered</p>
                                </div>
                                {!roleplayActive && !sceneEnded && (
                                    <Button
                                        onClick={handleStartRoleplay}
                                        disabled={!scenePackage || !selectedCharacter || pitchLoading || Object.keys(speakerMappings).length === 0}
                                        className="flex-none bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={Object.keys(speakerMappings).length === 0 ? "Map at least one speaker before starting Roleplay" : ""}
                                    >
                                        ▶ Start Roleplay
                                    </Button>
                                )}
                            </div>

                            {/* Settings tabs */}
                            <div className="px-6 pb-4">
                                <SettingsTabs
                                    variant="underline"
                                    readOnly
                                    targetLanguageLabel={translationLanguage}
                                    targetLanguageFlag={langFlag(nativeLanguage)}
                                    voiceStyleLabel={transliterationEnabled ? "With Transliteration" : "No Transliteration"}
                                    pitchEnabled={pitchEnabled}
                                    onPitchEnabledChange={setPitchEnabled}
                                    pitchSensitivity={pitchSensitivity}
                                    onPitchSensitivityChange={([v]) => setPitchSensitivity(v)}
                                    pitchContent={
                                        <div className="mb-6">
                                            <PitchChart 
                                                pitchPoints={fullVideoPitch}
                                                currentTimeRatio={
                                                    scenePackage.script.length > 0 
                                                        ? currentTime / (scenePackage.script[scenePackage.script.length - 1]?.endTime || 1)
                                                        : 0
                                                }
                                            />
                                        </div>
                                    }
                                    speakersContent={
                                        <SpeakerMappingPanel
                                            speakers={speakerStats}
                                            mappings={speakerMappings}
                                            onSave={setSpeakerMappings}
                                            onPlayPreview={(speakerId) => {
                                             if (playerRef.current) {
                                                 const targetSpeaker = speakerStats.find(s => s.speakerId === speakerId);
                                                 if (targetSpeaker && targetSpeaker.segments.length > 0) {
                                                     setPlaying(true);
                                                     playerRef.current.seekTo(targetSpeaker.segments[0]);
                                                 }
                                             }
                                        }}
                                        />
                                    }
                                />
                                
                                {/* ── Roleplay Active Area (Moved here per Task 7) ── */}
                                {(roleplayActive || sceneEnded || isPausedForRecording) && (
                                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                                        {isPausedForRecording && (
                                            <Alert className="bg-amber-500/10 border-amber-500/30">
                                                <span className="text-2xl leading-none mr-2 flex-none">🎙</span>
                                                <div>
                                                    <AlertTitle className="text-amber-700 dark:text-amber-300 text-sm font-bold">
                                                        Your turn!
                                                    </AlertTitle>
                                                    <AlertDescription className="text-amber-600/80 dark:text-amber-400/80 text-xs">
                                                        Record your line, then press Stop
                                                    </AlertDescription>
                                                </div>
                                            </Alert>
                                        )}
                                        <div className="flex items-center gap-4 flex-wrap">
                                            <RoleplayControls
                                                roleplayActive={roleplayActive}
                                                sceneEnded={sceneEnded}
                                                evaluationStarted={evaluationStarted}
                                                recordingCount={recordings.length}
                                                onStart={handleStartRoleplay}
                                                onFinish={handleFinish}
                                            />
                                            {isPausedForRecording && (
                                                <Recorder enabled={isPausedForRecording} onStop={handleRecordingStop} />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* ── Right: Script / Word panel (1/3 width, sticky) ───────────── */}
                    <div className="lg:col-span-1 lg:sticky lg:top-20">
                        {selectedWord ? (
                            <WordPanel
                                word={selectedWord.word}
                                lineText={selectedWord.lineText}
                                characterName={selectedWord.characterName}
                                pitchPattern={selectedLinePitch}
                                pitchLoading={pitchLoading}
                                onCapture={handleCaptureFrame}
                                onClose={() => setSelectedWord(null)}
                            />
                        ) : (
                            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden min-h-[500px]">
                                {/* Script panel header */}
                                <div className="flex-none px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                        Script
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        {pitchLoading && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                        )}
                                        <span className="text-xs text-slate-500 tabular-nums">
                                            {currentUserIndex} / {userLines.length} lines
                                        </span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto py-2 px-1">
                                    <ScriptPanel
                                        script={enrichedScript}
                                        selectedCharacter={selectedCharacter}
                                        currentUserIndex={currentUserIndex}
                                        roleplayActive={roleplayActive}
                                        isPausedForRecording={isPausedForRecording}
                                        selectedWord={selectedWord}
                                        onWordClick={handleWordClick}
                                        speakerMappings={speakerMappings}
                                        currentTime={currentTime}
                                        activeLineId={activeLineId}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}

// ─── Time formatter ───────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Language flag from ISO code ──────────────────────────────────────────────
const LANG_FLAGS: Record<string, string> = {
    en: "🇺🇸", ja: "🇯🇵", ko: "🇰🇷", zh: "🇨🇳", es: "🇪🇸",
    fr: "🇫🇷", de: "🇩🇪", pt: "🇵🇹", it: "🇮🇹", ar: "🇸🇦",
    hi: "🇮🇳", ru: "🇷🇺", tr: "🇹🇷", th: "🇹🇭", vi: "🇻🇳",
};
function langFlag(code: string): string {
    return LANG_FLAGS[code?.toLowerCase()] ?? "";
}