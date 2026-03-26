"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { evaluateSession } from "@/lib/api";
import { useSutoriiStore, useScriptAndCharacter, usePitchMap } from "@/store/sutorii";

import { AppHeader, HeaderNav } from "@/components/AppHeader";
import { StatsBar, StatItem } from "@/components/StatsBar";
import { TranscriptViewer, ViewerLine } from "@/components/TranscriptViewer";

import { useState } from "react";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ResultsPage() {
    const router = useRouter();

    // ── Store ───────────────────────────────────────────────────────────────────
    const {
        scenePackage,
        recordings,
        sessionEvaluation,
        setSessionEvaluation,
    } = useSutoriiStore();

    const { script, selectedCharacter } = useScriptAndCharacter();
    const pitchMap = usePitchMap();

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

    // ── Guard: redirect if no scene ─────────────────────────────────────────────
    useEffect(() => {
        if (!scenePackage || !selectedCharacter) {
            router.replace("/setup");
        }
    }, [scenePackage, selectedCharacter, router]);

    // ── Auto-evaluate on mount if recordings exist but results don't ─────────────
    const [evaluating, setEvaluating] = useState(false);

    useEffect(() => {
        if (!scenePackage || recordings.length === 0 || sessionEvaluation) return;
        runEvaluation();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function runEvaluation() {
        if (!scenePackage || recordings.length === 0) return;
        setEvaluating(true);
        
        try {
            // Map recordings to include expected text for the API
            const recordingsWithText = recordings.map(rec => {
                const line = userLines.find(l => l.id === rec.lineId);
                return {
                    lineId: rec.lineId,
                    expectedText: line?.text ?? "",
                    audioBlob: rec.blob
                };
            }).filter(r => r.expectedText !== "");

            const result = await evaluateSession({
                sceneId: scenePackage.sceneId,
                sourceLang: scenePackage.language,
                recordings: recordingsWithText,
                pitchMap: pitchMap
            });
            
            setSessionEvaluation(result);
        } catch (err) {
            console.error("[Results] Session evaluation failed:", err);
        } finally {
            setEvaluating(false);
        }
    }

    // ── Transcript viewer toggles ─────────────────────────────────────────────
    const [showTimestamps, setShowTimestamps] = useState(true);
    const [showTranslation, setShowTranslation] = useState(false);
    const [showPhonetics, setShowPhonetics] = useState(false);

    // ── Derived ──────────────────────────────────────────────────────────────────
    const evaluationResults = useMemo(() => sessionEvaluation?.lines ?? [], [sessionEvaluation]);

    const avgScore = useMemo(() => {
        if (!sessionEvaluation) return 0;
        return sessionEvaluation.overallScore;
    }, [sessionEvaluation]);

    const mappingPercent = useMemo(() => {
        if (!userLines.length) return 0;
        return Math.round((evaluationResults.length / userLines.length) * 100);
    }, [evaluationResults.length, userLines.length]);

    const stats: StatItem[] = [
        {
            label: "Duration",
            value: formatTime(scenePackage?.audio?.duration ?? 0),
        },
        {
            label: "Transcription",
            value: "Complete",
            variant: "success",
        },
        {
            label: "Your Lines",
            value: String(userLines.length).padStart(2, "0"),
        },
        {
            label: "Score",
            value: "",
            variant: "progress",
            progressValue: avgScore,
            progressLabel: `${avgScore}%`,
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

    // ─── Render ──────────────────────────────────────────────────────────────────
    if (!scenePackage || !selectedCharacter) return null;

    return (
        <div className="min-h-screen bg-[#f6f6f8] dark:bg-[#101022] flex flex-col font-sans">

            {/* ── Header with nav ────────────────────────────────────────────────── */}
            <AppHeader
                centerSlot={
                    <HeaderNav
                        items={[
                            { label: "Scenes", href: "/setup" },
                            { label: "Transcript", href: "/results", active: true },
                            { label: "Settings", href: "/setup" },
                        ]}
                    />
                }
            />

            {/* ── Main ───────────────────────────────────────────────────────────── */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-8 space-y-8">

                {/* Page title */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div className="space-y-1">
                        <h2 className="text-4xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                            {scenePackage.sceneId.slice(0, 12)}…
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            Playing as {selectedCharacter} · Scene Results
                        </p>
                    </div>
                    {evaluating && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <div className="w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full animate-spin" />
                            Evaluating recordings…
                        </div>
                    )}
                </div>

                {/* Stats bar */}
                <StatsBar stats={stats} />

                {/* Transcript viewer */}
                <TranscriptViewer
                    lines={viewerLines}
                    showTimestamps={showTimestamps}
                    onShowTimestampsChange={setShowTimestamps}
                    showTranslation={showTranslation}
                    onShowTranslationChange={setShowTranslation}
                    showPhonetics={showPhonetics}
                    onShowPhoneticsChange={setShowPhonetics}
                    onBackToPlayer={() => router.push("/play")}
                    onEditTranscript={() => console.log("[Results] Edit transcript")}
                    onSaveChanges={() => console.log("[Results] Save changes")}
                />

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