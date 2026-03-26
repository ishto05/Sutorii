"use client";

import * as React from "react";
import { Play, Volume2, Maximize, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type VideoCardProps = {
    // ── Playback state (passed through unchanged from page.tsx) ──────────────
    playing: boolean;
    onPlayToggle: () => void;

    // ── Video metadata ────────────────────────────────────────────────────────
    thumbnailUrl?: string;   // background image for the video area
    title?: string;
    duration?: string;       // formatted e.g. "12:45"
    quality?: string;        // e.g. "High Quality"

    // ── Progress / controls (screens 3, 4, 5) ────────────────────────────────
    showControls?: boolean;  // show bottom progress bar + time controls
    progress?: number;       // 0–100, drives progress bar fill width
    currentTime?: string;    // e.g. "0:37"
    totalTime?: string;      // e.g. "2:23"
    onVolumeClick?: () => void;
    onFullscreenClick?: () => void;

    // ── Overlay badge (screen 1) ──────────────────────────────────────────────
    overlayBadge?: string;   // e.g. "Video Preview Available"

    // ── Detected language badge (top-left, shown after preview fetch) ─────────
    detectedLanguage?: string; // e.g. "Japanese"

    // ── Loading spinner overlay (while previewScene() is in flight) ──────────
    loading?: boolean;

    // ── Error message (shown in title row when preview fetch fails) ──────────
    error?: string;

    // ── Mastery (screen 5) ───────────────────────────────────────────────────
    masteryPercent?: number; // shows badge + progress bar below title

    // ── "Start Playing" action button (screen 1) ─────────────────────────────
    onStartPlaying?: () => void;

    // ── Slot for tab content rendered inside the card below the video ─────────
    // (screens 1, 5 have Language Settings / Speakers / Pitch tabs inside card)
    children?: React.ReactNode;

    className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function VideoCard({
    playing,
    onPlayToggle,
    thumbnailUrl,
    title,
    duration,
    quality,
    showControls = false,
    progress = 0,
    currentTime,
    totalTime,
    onVolumeClick,
    onFullscreenClick,
    overlayBadge,
    detectedLanguage,
    loading = false,
    error,
    masteryPercent,
    onStartPlaying,
    children,
    className,
}: VideoCardProps) {
    return (
        <Card
            className={cn(
                "overflow-hidden shadow-sm border-slate-200 dark:border-slate-800",
                "bg-white dark:bg-slate-900",
                className
            )}
        >
            {/* ── Video area ─────────────────────────────────────────────────────── */}
            <div className="p-1">
                <div
                    className="relative w-full aspect-video rounded-lg overflow-hidden group bg-slate-900"
                    style={
                        thumbnailUrl
                            ? { backgroundImage: `url('${thumbnailUrl}')`, backgroundSize: "cover", backgroundPosition: "center" }
                            : undefined
                    }
                >
                    {/* Dimming overlay */}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

                    {/* Play / Pause button */}
                    <button
                        onClick={onPlayToggle}
                        className={cn(
                            "absolute inset-0 flex items-center justify-center z-10",
                            "focus:outline-none"
                        )}
                        aria-label={playing ? "Pause" : "Play"}
                    >
                        <div
                            className={cn(
                                "flex items-center justify-center rounded-full",
                                "bg-primary text-white shadow-2xl",
                                "transition-transform group-hover:scale-110",
                                // Screen 1 uses larger play button (w-20 h-20), others use w-16 h-16
                                onStartPlaying ? "w-20 h-20" : "w-16 h-16"
                            )}
                        >
                            <Play
                                className={cn(
                                    "fill-white translate-x-0.5",
                                    onStartPlaying ? "h-8 w-8" : "h-7 w-7"
                                )}
                            />
                        </div>
                    </button>

                    {/* Overlay badge — "Video Preview Available" (screen 1) */}
                    {overlayBadge && (
                        <div className="absolute bottom-4 left-4 z-10">
                            <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/20">
                                <p className="text-white text-sm font-medium">{overlayBadge}</p>
                            </div>
                        </div>
                    )}

                    {/* Detected language badge — top-left, shown after preview fetch */}
                    {detectedLanguage && (
                        <div className="absolute top-4 left-4 z-10">
                            <div className="bg-primary/90 backdrop-blur-sm px-2.5 py-1 rounded-full">
                                <p className="text-white text-xs font-semibold">{detectedLanguage}</p>
                            </div>
                        </div>
                    )}

                    {/* Loading spinner — shown while previewScene() is in flight */}
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        </div>
                    )}

                    {/* Controls bar — progress + time + icons (screens 3, 4, 5) */}
                    {showControls && (
                        <div className="absolute inset-x-0 bottom-0 z-10 px-4 py-4 bg-gradient-to-t from-black/80 to-transparent">
                            {/* Progress bar */}
                            <div className="flex h-1.5 items-center rounded-full bg-white/30 mb-3 overflow-hidden">
                                <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                />
                            </div>
                            {/* Time + controls row */}
                            <div className="flex items-center justify-between text-white text-xs font-medium">
                                <span className="tabular-nums">{currentTime ?? "0:00"}</span>
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={onVolumeClick}
                                        className="hover:opacity-80 transition-opacity"
                                        aria-label="Volume"
                                    >
                                        <Volume2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={onFullscreenClick}
                                        className="hover:opacity-80 transition-opacity"
                                        aria-label="Fullscreen"
                                    >
                                        <Maximize className="h-4 w-4" />
                                    </button>
                                </div>
                                <span className="tabular-nums">{totalTime ?? "0:00"}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Info row — title + Start Playing (screen 1) ──────────────────────── */}
            {(title || onStartPlaying) && (
                <CardContent
                    className={cn(
                        "flex items-center justify-between gap-4",
                        "border-t border-slate-100 dark:border-slate-800",
                        "px-6 py-4"
                    )}
                >
                    {/* Title + meta */}
                    {title && (
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <h3 className="text-slate-900 dark:text-slate-100 font-bold text-lg leading-tight truncate">
                                {title}
                            </h3>
                            {(duration || quality) && (
                                <p className="text-slate-500 dark:text-slate-400 text-sm">
                                    {[duration && `Duration: ${duration}`, quality]
                                        .filter(Boolean)
                                        .join(" • ")}
                                </p>
                            )}
                            {error && (
                                <p className="text-red-500 dark:text-red-400 text-xs mt-0.5">{error}</p>
                            )}
                        </div>
                    )}

                    {/* Start Playing button */}
                    {onStartPlaying && (
                        <Button
                            onClick={onStartPlaying}
                            className={cn(
                                "flex-none bg-primary hover:bg-primary/90 text-white",
                                "px-6 py-2.5 font-semibold shadow-lg shadow-primary/20",
                                "flex items-center gap-2"
                            )}
                        >
                            Start Playing
                            <Zap className="h-4 w-4" />
                        </Button>
                    )}
                </CardContent>
            )}

            {/* ── Mastery row — title + badge + progress bar (screen 5) ────────────── */}
            {masteryPercent !== undefined && title && !onStartPlaying && (
                <CardContent className="px-6 pt-4 pb-2">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-end justify-between gap-2">
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                                {title}
                            </h1>
                            <Badge
                                variant="secondary"
                                className="flex-none text-sm font-medium text-primary bg-primary/10 border-0"
                            >
                                {masteryPercent}% Mastered
                            </Badge>
                        </div>
                        {/* Mastery progress bar */}
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${Math.min(100, Math.max(0, masteryPercent))}%` }}
                            />
                        </div>
                    </div>
                </CardContent>
            )}

            {/* ── Children slot — tab content (screens 1, 5) ───────────────────────── */}
            {children && (
                <CardContent className="px-6 pb-6 pt-0">
                    {children}
                </CardContent>
            )}
        </Card>
    );
}

export default VideoCard;