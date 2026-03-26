"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type WaveformTimelineProps = {
    /** Array of 0–1 values representing bar heights. Computed from pitchMap in parent. */
    bars: number[];
    /** 0–1 — drives playhead position and played/active/future zone coloring */
    playheadRatio: number;
    /** Called with the click ratio (0–1) when user clicks the timeline — existing handler */
    onSeek?: (ratio: number) => void;
    className?: string;
};

// ─── Bar zone classifier ──────────────────────────────────────────────────────
// Three zones relative to the playhead position:
//   played  — left of playhead (dim primary)
//   active  — at the playhead (2 bars, full primary)
//   future  — right of playhead (slate-700)
type BarZone = "played" | "active" | "future";

function getZone(index: number, total: number, playheadRatio: number): BarZone {
    const playheadIndex = Math.floor(playheadRatio * total);
    if (index >= playheadIndex && index <= playheadIndex + 1) return "active";
    if (index < playheadIndex) return "played";
    return "future";
}

const zoneClass: Record<BarZone, string> = {
    played: "bg-primary/40 opacity-40",
    active: "bg-primary opacity-100",
    future: "bg-slate-700 opacity-100",
};

// ─── Component ────────────────────────────────────────────────────────────────
export function WaveformTimeline({
    bars,
    playheadRatio,
    onSeek,
    className,
}: WaveformTimelineProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);

    // Click → compute ratio from click position → call onSeek (existing handler)
    function handleClick(e: React.MouseEvent<HTMLDivElement>) {
        if (!onSeek || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        onSeek(ratio);
    }

    const clampedRatio = Math.min(1, Math.max(0, playheadRatio));
    const playheadPercent = `${clampedRatio * 100}%`;

    return (
        <div
            ref={containerRef}
            onClick={handleClick}
            className={cn(
                "relative h-20 w-full",
                "bg-[#0a0a0b] rounded-lg",
                "border border-white/5",
                "flex items-end gap-[2px] px-2 py-2",
                "overflow-hidden",
                onSeek && "cursor-pointer",
                className
            )}
        >
            {/* ── Playhead vertical line ──────────────────────────────────────── */}
            <div
                className="absolute top-0 bottom-0 w-[2px] bg-primary z-20"
                style={{
                    left: playheadPercent,
                    boxShadow: "0 0 10px rgba(19,19,236,0.5)",
                }}
            >
                {/* Playhead dot */}
                <div className="absolute -top-1 -left-[5px] w-3 h-3 bg-white border-2 border-primary rounded-full" />
            </div>

            {/* ── Waveform bars ────────────────────────────────────────────────── */}
            <div className="flex-1 flex items-end gap-[2px] h-full">
                {bars.map((height, i) => {
                    const zone = getZone(i, bars.length, clampedRatio);
                    // Clamp height between 8% min (always visible) and 100%
                    const heightPct = `${Math.min(100, Math.max(8, height * 100))}%`;

                    return (
                        <div
                            key={i}
                            className={cn(
                                "flex-1 rounded-sm transition-all duration-200",
                                zoneClass[zone]
                            )}
                            style={{ height: heightPct }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

// ─── Default bars ─────────────────────────────────────────────────────────────
// Fallback demo bars matching the reference HTML — used when no pitch data yet.
export const DEFAULT_WAVEFORM_BARS: number[] = [
    0.30, 0.50, 0.70, 0.40, 0.60, 0.90, 0.30, 0.55, 0.75, 0.40,
    0.30, 0.50, 0.70, 0.40, 0.60, 0.95, 0.85, 0.45, 0.30, 0.55,
    0.75, 0.40, 0.20, 0.60, 0.80, 0.50, 0.40, 0.70, 0.35, 0.55,
    0.25, 0.85, 0.45, 0.30, 0.15, 0.60, 0.80, 0.50,
];

export default WaveformTimeline;