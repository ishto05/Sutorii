"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Lightbulb, Mic, Music, AlignLeft, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionEvaluation, EvaluationResult } from "@/lib/api";

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
    session: SessionEvaluation;
};

// ─── Score ring colors ────────────────────────────────────────────────────────
function scoreColor(score: number): string {
    if (score >= 80) return "text-emerald-500";
    if (score >= 60) return "text-amber-500";
    return "text-red-500";
}

function scoreBg(score: number): string {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
}

function scoreBorder(score: number): string {
    if (score >= 80) return "border-emerald-400";
    if (score >= 60) return "border-amber-400";
    return "border-red-400";
}

// ─── Pitch feedback badge ─────────────────────────────────────────────────────
const PITCH_LABELS: Record<string, { label: string; color: string }> = {
    good: { label: "Pitch ✓", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
    flat: { label: "Too Flat", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
    rising: { label: "Rising", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
    falling: { label: "Falling", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400" },
    unavailable: { label: "Pitch N/A", color: "bg-slate-100 text-slate-400 dark:bg-slate-800" },
};

// ─── Score bar ────────────────────────────────────────────────────────────────
function ScoreBar({ label, score, icon }: { label: string; score: number; icon: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                    {icon}
                    {label}
                </span>
                <span className={cn("font-bold tabular-nums", scoreColor(score))}>
                    {score < 0 ? "N/A" : `${Math.round(score)}`}
                </span>
            </div>
            {score >= 0 && (
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className={cn("h-full rounded-full transition-all", scoreBg(score))}
                        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                    />
                </div>
            )}
        </div>
    );
}

// ─── Word score chip ──────────────────────────────────────────────────────────
function WordChip({ word, score }: { word: string; score: number }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border",
                score >= 80
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                    : score >= 60
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800"
                        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
            )}
        >
            {word}
            <span className="opacity-70 tabular-nums">{Math.round(score)}</span>
        </span>
    );
}

// ─── Per-line result card ─────────────────────────────────────────────────────
function LineCard({ result, index }: { result: EvaluationResult; index: number }) {
    const [expanded, setExpanded] = useState(false);
    const overall = result.scores.overall;
    const pitchInfo = result.pitchFeedback ? PITCH_LABELS[result.pitchFeedback] : null;

    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">

            {/* Card header — always visible */}
            <button
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-start gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
                {/* Score ring */}
                <div className={cn(
                    "w-12 h-12 rounded-full border-2 flex items-center justify-center flex-none",
                    scoreBorder(overall)
                )}>
                    <span className={cn("text-base font-black tabular-nums", scoreColor(overall))}>
                        {Math.round(overall)}
                    </span>
                </div>

                {/* Line content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Line {index + 1}
                        </span>
                        {pitchInfo && (
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", pitchInfo.color)}>
                                {pitchInfo.label}
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
                        {result.expectedText}
                    </p>
                    {result.transcript !== result.expectedText && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 italic truncate">
                            Heard: "{result.transcript}"
                        </p>
                    )}
                </div>

                {/* Expand chevron */}
                <div className="flex-none mt-1 text-slate-400">
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 space-y-5 pt-4">

                    {/* Score breakdown */}
                    <div className="grid grid-cols-2 gap-3">
                        <ScoreBar label="Text Accuracy" score={result.scores.textAccuracy} icon={<AlignLeft className="h-3 w-3" />} />
                        <ScoreBar label="Pronunciation" score={result.scores.pronunciation} icon={<Mic className="h-3 w-3" />} />
                        <ScoreBar label="Fluency" score={result.scores.fluency} icon={<Zap className="h-3 w-3" />} />
                        <ScoreBar label="Pitch Accuracy" score={result.scores.pitchAccuracy} icon={<Music className="h-3 w-3" />} />
                    </div>

                    {/* Word scores */}
                    {result.wordScores.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                                Word Scores
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {result.wordScores.map((ws, i) => (
                                    <WordChip key={i} word={ws.word} score={ws.score} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Feedback summary + tips */}
                    {result.feedback.summary && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {result.feedback.summary}
                            </p>
                            {result.feedback.tips.length > 0 && (
                                <ul className="space-y-1">
                                    {result.feedback.tips.map((tip, i) => (
                                        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                            <Lightbulb className="h-3 w-3 text-amber-400 flex-none mt-0.5" />
                                            {tip}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function EvaluationPanel({ session }: Props) {
    const overall = session.overallScore;

    return (
        <div className="flex flex-col gap-6">

            {/* ── Session summary card ────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
                <div className="flex items-center gap-5">

                    {/* Big score ring */}
                    <div className={cn(
                        "w-20 h-20 rounded-full border-4 flex items-center justify-center flex-none",
                        scoreBorder(overall)
                    )}>
                        <span className={cn("text-2xl font-black tabular-nums", scoreColor(overall))}>
                            {Math.round(overall)}
                        </span>
                    </div>

                    {/* Summary text */}
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            Session Complete
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {session.linesEvaluated} line{session.linesEvaluated !== 1 ? "s" : ""} evaluated
                        </p>
                        {session.sessionFeedback && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                                {session.sessionFeedback}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Per-line results ────────────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 px-1">
                    Line Breakdown
                </p>
                {session.lines.map((result, i) => (
                    <LineCard key={result.evaluationId ?? i} result={result} index={i} />
                ))}
            </div>
        </div>
    );
}