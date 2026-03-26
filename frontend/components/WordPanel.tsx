"use client";

import { useEffect, useState } from "react";
import type { WordToken } from "@/components/ScriptSelector";

type WordPanelProps = {
    word: WordToken;
    lineText: string;
    characterName: string;
    pitchPattern: number[] | null;       // null = not yet loaded
    pitchLoading: boolean;
    onCapture: (startTime: number) => Promise<string | null>;
    onClose: () => void;
};

// ─── Pitch mini-visualiser ────────────────────────────────────────────────────
function PitchBars({ pattern }: { pattern: number[] }) {
    const voiced = pattern.filter((v) => v > 0);
    const max = Math.max(...voiced, 1);
    const min = Math.min(...voiced, 0);
    const range = max - min || 1;

    return (
        <div className="flex items-end gap-[2px] h-10">
            {pattern.map((val, i) => {
                const isVoiced = val > 0;
                const heightPct = isVoiced ? ((val - min) / range) * 80 + 20 : 8;
                return (
                    <div
                        key={i}
                        title={isVoiced ? `${val.toFixed(1)} Hz` : "unvoiced"}
                        style={{ height: `${heightPct}%` }}
                        className={[
                            "flex-1 rounded-sm transition-all",
                            isVoiced
                                ? "bg-indigo-400"
                                : "bg-gray-700",
                        ].join(" ")}
                    />
                );
            })}
        </div>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WordPanel({
    word,
    lineText,
    characterName,
    pitchPattern,
    pitchLoading,
    onCapture,
    onClose,
}: WordPanelProps) {
    const [frameDataUrl, setFrameDataUrl] = useState<string | null | "loading">("loading");
    const [savePlaceholderHover, setSavePlaceholderHover] = useState(false);

    // Capture frame on mount
    useEffect(() => {
        if (word.startTime == null) {
            setFrameDataUrl(null);
            return;
        }
        setFrameDataUrl("loading");
        onCapture(word.startTime).then((url) => {
            setFrameDataUrl(url); // null if cross-origin blocked
        });
    }, [word.word, word.startTime]);

    const hasTimestamp = word.startTime != null;

    return (
        <div className="flex flex-col h-full">

            {/* ── Header ── */}
            <div className="flex-none px-4 pt-4 pb-3 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                        title="Back to script"
                    >
                        ←
                    </button>
                    <h2 className="text-sm font-semibold text-white">Word Detail</h2>
                </div>
                <span className="text-[10px] text-gray-600 uppercase tracking-widest">{characterName}</span>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto">

                {/* Word + reading */}
                <div className="px-4 pt-5 pb-4 border-b border-gray-800/60">
                    <p className="text-3xl font-bold text-white tracking-wide mb-1">{word.word}</p>
                    {word.reading && (
                        <p className="text-sm text-indigo-400 font-medium">{word.reading}</p>
                    )}
                    {word.meaning && (
                        <p className="text-sm text-gray-400 mt-2 leading-relaxed">{word.meaning}</p>
                    )}
                </div>

                {/* Context line */}
                <div className="px-4 py-3 border-b border-gray-800/60">
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">In context</p>
                    <p className="text-sm text-gray-300 leading-relaxed">
                        {lineText.split("").map((char, i) => {
                            // Highlight the word within the line text
                            const wordStart = lineText.indexOf(word.word);
                            const wordEnd = wordStart + word.word.length;
                            const isHighlighted = wordStart >= 0 && i >= wordStart && i < wordEnd;
                            return (
                                <span
                                    key={i}
                                    className={isHighlighted ? "text-white font-semibold underline decoration-indigo-500 underline-offset-2" : ""}
                                >
                                    {char}
                                </span>
                            );
                        })}
                    </p>
                </div>

                {/* Timestamp */}
                {hasTimestamp && (
                    <div className="px-4 py-3 border-b border-gray-800/60">
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">Timestamp</p>
                        <p className="text-xs text-gray-500 tabular-nums">
                            {word.startTime!.toFixed(2)}s
                            {word.endTime != null && ` → ${word.endTime.toFixed(2)}s`}
                        </p>
                    </div>
                )}

                {/* Video frame capture */}
                <div className="px-4 py-3 border-b border-gray-800/60">
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Scene frame</p>
                    {!hasTimestamp ? (
                        <div className="aspect-video w-full rounded-lg bg-gray-800/60 flex items-center justify-center">
                            <span className="text-xs text-gray-600">No timestamp available</span>
                        </div>
                    ) : frameDataUrl === "loading" ? (
                        <div className="aspect-video w-full rounded-lg bg-gray-800/60 flex items-center justify-center">
                            <div className="w-5 h-5 border-2 border-gray-700 border-t-indigo-500 rounded-full animate-spin" />
                        </div>
                    ) : frameDataUrl ? (
                        <img
                            src={frameDataUrl}
                            alt={`Frame at ${word.startTime}s`}
                            className="w-full rounded-lg border border-gray-700 object-cover"
                        />
                    ) : (
                        // YouTube cross-origin fallback — show timestamp badge instead
                        <div className="aspect-video w-full rounded-lg bg-gray-800/40 border border-gray-800 flex flex-col items-center justify-center gap-2">
                            <svg className="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                            </svg>
                            <span className="text-xs text-gray-600 text-center px-4">
                                Frame capture unavailable for YouTube<br />
                                <span className="text-gray-700">({word.startTime!.toFixed(2)}s)</span>
                            </span>
                        </div>
                    )}
                </div>

                {/* Pitch contour */}
                <div className="px-4 py-3 border-b border-gray-800/60">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Pitch contour</p>
                        {pitchLoading && (
                            <span className="flex items-center gap-1 text-[10px] text-indigo-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                                Processing…
                            </span>
                        )}
                    </div>

                    {pitchPattern && pitchPattern.length > 0 ? (
                        <PitchBars pattern={pitchPattern} />
                    ) : pitchLoading ? (
                        <div className="h-10 rounded bg-gray-800/60 animate-pulse" />
                    ) : (
                        <div className="h-10 rounded bg-gray-800/40 flex items-center justify-center">
                            <span className="text-xs text-gray-700">Pitch data unavailable</span>
                        </div>
                    )}

                    {pitchPattern && (
                        <div className="flex items-center gap-3 mt-1.5">
                            <span className="flex items-center gap-1 text-[10px] text-gray-600">
                                <span className="w-2 h-2 rounded-sm bg-indigo-400 inline-block" /> voiced
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-gray-600">
                                <span className="w-2 h-2 rounded-sm bg-gray-700 inline-block" /> unvoiced
                            </span>
                        </div>
                    )}
                </div>

                {/* Save to profile — placeholder */}
                <div className="px-4 py-4">
                    <div
                        className="relative"
                        onMouseEnter={() => setSavePlaceholderHover(true)}
                        onMouseLeave={() => setSavePlaceholderHover(false)}
                    >
                        <button
                            disabled
                            className="w-full py-2.5 rounded-lg border border-gray-700 text-sm font-semibold text-gray-600 cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                            Save to profile
                        </button>
                        {savePlaceholderHover && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-400 whitespace-nowrap pointer-events-none z-10">
                                Coming soon — profiles not yet implemented
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-700" />
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}