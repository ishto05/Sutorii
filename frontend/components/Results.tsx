"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSutoriiStore, useScriptAndCharacter, usePitchMap } from "@/store/sutorii";

import { AppHeader, HeaderNav } from "@/components/AppHeader";
import { StatsBar, StatItem } from "@/components/StatsBar";
import { TranscriptViewer, ViewerLine } from "@/components/TranscriptViewer";
import EvaluationPanel from "@/components/EvaluationPanel";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ResultsPage() {
    const router = useRouter();

    // ── Store ───────────────────────────────────────────────────────────────────
    const {
        scenePackage,
        videoTitle,
        sessionEvaluation,
    } = useSutoriiStore();

    const { script, selectedCharacter } = useScriptAndCharacter();
    const pitchMap = usePitchMap();

    // ── Guard: redirect if no scene ─────────────────────────────────────────────
    useEffect(() => {
        if (!scenePackage || !selectedCharacter) {
            router.replace("/setup");
        }
    }, [scenePackage, selectedCharacter, router]);

    // ── Derived ──────────────────────────────────────────────────────────────────
    const userLines = useMemo(
        () =>
            script && selectedCharacter
                ? script.filter((l) => l.characterName === selectedCharacter)
                : [],
        [script, selectedCharacter]
    );

    const enrichedScript = useMemo(() => {
        if (!script) return [];
        return script.map((line) => ({
            ...line,
            pitchPattern: pitchMap[line.id] ?? line.pitchPattern ?? null,
        }));
    }, [script, pitchMap]);

    const overallScore = sessionEvaluation?.overallScore ?? 0;

    const stats: StatItem[] = [
        { label: "Duration", value: formatTime(scenePackage?.audio?.duration ?? 0) },
        { label: "Transcription", value: "Complete", variant: "success" },
        { label: "Your Lines", value: String(userLines.length).padStart(2, "0") },
        {
            label: "Score",
            value: "",
            variant: "progress",
            progressValue: overallScore,
            progressLabel: `${Math.round(overallScore)}%`,
        },
    ];

    const viewerLines: ViewerLine[] = useMemo(() => {
        return enrichedScript.map((line) => ({
            id: line.id,
            timestamp: formatTime(line.startTime),
            speakerLabel: line.characterName,
            text: line.text,
            translation: line.translation ?? undefined,
            phonetics: line.transliteration ?? undefined,
        }));
    }, [enrichedScript]);

    const [showTimestamps, setShowTimestamps] = useState(true);
    const [showTranslation, setShowTranslation] = useState(false);
    const [showPhonetics, setShowPhonetics] = useState(false);

    // ─── Render ──────────────────────────────────────────────────────────────────
    if (!scenePackage || !selectedCharacter) return null;

    return (
        <div className="min-h-screen bg-[#f6f6f8] dark:bg-[#101022] flex flex-col font-sans">

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <AppHeader
                centerSlot={
                    <HeaderNav
                        items={[
                            { label: "Setup", href: "/setup" },
                            { label: "Play", href: "/play" },
                            { label: "Results", href: "/results", active: true },
                        ]}
                    />
                }
            />

            {/* ── Main ───────────────────────────────────────────────────────────── */}
            <main className="flex-1 mx-auto w-full px-4 lg:px-10 py-8 space-y-8">

                {/* Page title */}
                <div>
                    <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50 truncate">
                        {videoTitle || scenePackage.source?.title || scenePackage.sceneId.slice(0, 16) + "…"}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                        Playing as {selectedCharacter} · Session Results
                    </p>
                </div>

                {/* Stats bar */}
                <StatsBar stats={stats} />

                {/* Two-column grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* Left: transcript viewer (2/3) */}
                    <div className="lg:col-span-2">
                        <TranscriptViewer
                            lines={viewerLines}
                            showTimestamps={showTimestamps}
                            onShowTimestampsChange={setShowTimestamps}
                            showTranslation={showTranslation}
                            onShowTranslationChange={setShowTranslation}
                            showPhonetics={showPhonetics}
                            onShowPhoneticsChange={setShowPhonetics}
                            onBackToPlayer={() => router.push("/play")}
                            onEditTranscript={() => { }}
                            onSaveChanges={() => { }}
                        />
                    </div>

                    {/* Right: evaluation panel (1/3, sticky) */}
                    <div className="lg:col-span-1 lg:sticky lg:top-20">
                        {sessionEvaluation ? (
                            <EvaluationPanel session={sessionEvaluation} />
                        ) : (
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-400">
                                <p>No evaluation data yet.</p>
                                <p className="mt-1 text-xs">Complete a roleplay session to see your scores.</p>
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}