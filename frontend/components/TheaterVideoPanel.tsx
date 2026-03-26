"use client";

import * as React from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type TheaterVideoPanelProps = {
    // ── Player slot ─────────────────────────────────────────────────────────────
    // ReactPlayer is injected from parent — we never own the player here.
    // Parent passes <VideoPlayer ref={playerRef} ... /> as this slot.
    player: React.ReactNode;

    // ── Overlays ─────────────────────────────────────────────────────────────────
    title?: string;
    chapter?: string;         // e.g. "Chapter 4: The Pursuit"

    // ── Playback state — existing, unchanged ────────────────────────────────────
    // Only play/pause is controlled programmatically.
    // Volume, prev/next, fullscreen are handled by YouTube's native controls.
    playing: boolean;
    onPlayToggle: () => void;

    // ── Time display — driven by onTimeUpdate in page.tsx ───────────────────────
    currentTime: string;      // e.g. "02:14"
    totalTime: string;        // e.g. "05:00"

    // ── Waveform slot — WaveformTimeline injected from parent ───────────────────
    waveform?: React.ReactNode;

    className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function TheaterVideoPanel({
    player,
    title,
    chapter,
    playing,
    onPlayToggle,
    currentTime,
    totalTime,
    waveform,
    className,
}: TheaterVideoPanelProps) {
    return (
        <div className={cn("flex flex-col h-full", className)}>

            {/* ── Video area ───────────────────────────────────────────────────── */}
            <div className="relative flex-1 overflow-hidden group">

                {/* ReactPlayer fills the full area — injected from parent */}
                <div className="absolute inset-0">
                    {player}
                </div>

                {/* Center play/pause overlay — only shown when paused */}
                {!playing && (
                    <button
                        onClick={onPlayToggle}
                        className={cn(
                            "absolute inset-0 m-auto z-10",
                            "w-20 h-20 rounded-full",
                            "bg-primary/80 hover:bg-primary text-white",
                            "flex items-center justify-center",
                            "transition-all transform hover:scale-110",
                            "shadow-2xl focus:outline-none"
                        )}
                        aria-label="Play"
                    >
                        <Play className="w-10 h-10 ml-1 fill-white" />
                    </button>
                )}

                {/* Title + chapter overlay — bottom left, above controls */}
                {(title || chapter) && (
                    <div className="absolute bottom-6 left-8 z-10 pointer-events-none">
                        {title && (
                            <h1 className="text-4xl font-bold text-white drop-shadow-lg mb-2 leading-tight">
                                {title}
                            </h1>
                        )}
                        {chapter && (
                            <span className="inline-block bg-white/20 backdrop-blur-md text-white text-sm px-3 py-1 rounded-md border border-white/30">
                                {chapter}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* ── Controls bar ─────────────────────────────────────────────────── */}
            <div
                className={cn(
                    "bg-[#161618]/95 backdrop-blur-xl",
                    "border-t border-white/5",
                    "px-6 pt-5 pb-4",
                    "flex flex-col gap-4"
                )}
            >
                {/* Single row: play/pause + time label */}
                <div className="flex items-center justify-between">

                    {/* Play / Pause button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onPlayToggle}
                        className={cn(
                            "text-white hover:text-white hover:bg-transparent",
                            "hover:scale-110 transition-transform h-10 w-10"
                        )}
                        aria-label={playing ? "Pause" : "Play"}
                    >
                        {playing ? (
                            <Pause className="h-8 w-8 fill-white" />
                        ) : (
                            <Play className="h-8 w-8 fill-white ml-0.5" />
                        )}
                    </Button>

                    {/* Time display */}
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] tracking-widest text-slate-500 font-bold uppercase">
                            Pitch &amp; Waveform Timeline
                        </span>
                        <span className="text-primary font-mono text-sm font-bold tabular-nums">
                            {currentTime} / {totalTime}
                        </span>
                    </div>
                </div>

                {/* Waveform slot */}
                {waveform && <div>{waveform}</div>}
            </div>

        </div>
    );
}

export default TheaterVideoPanel;