"use client";

import * as React from "react";
import { FileText, Volume2, PlayCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
export type TranscriptLine = {
    id: string;
    timestamp: string;          // e.g. "00:37"
    startTime: number;          // seconds — used by onLineClick
    text: string;               // native script
    transliteration?: string | null;   // e.g. "[Mada mada dane]"
    translation?: string | null;       // e.g. "You still have a long way to go"
};

// Header right-side variant
type HeaderVariant =
    | "draft"                   // Screen 1 — "DRAFT" badge
    | "toggle-translation"      // Screen 5 — Translation (off) | Phonetics (on)
    | "toggle-lang"             // Screen 3 — English | Original radio pills
    | "none";

// Footer variant
type FooterVariant =
    | "info"                    // Screen 1 — "AI will analyze audio for precision."
    | "cta"                     // Screen 5 — "Continue Learning" button
    | "none";

type TranscriptPanelProps = {
    // ── Status ─────────────────────────────────────────────────────────────────
    status: "empty" | "ready";

    // ── Header ─────────────────────────────────────────────────────────────────
    headerVariant?: HeaderVariant;
    /** For toggle-translation / toggle-lang — which value is active */
    activeToggle?: string;
    /** Called with the new toggle value — existing handler, unchanged */
    onToggle?: (value: string) => void;

    // ── Lines ──────────────────────────────────────────────────────────────────
    lines?: TranscriptLine[];
    /** ID of the currently active line — drives highlight */
    activeLineId?: string;
    /** Existing handler — called when user clicks a line */
    onLineClick?: (lineId: string, startTime: number) => void;
    /** Called when volume icon on active line is clicked */
    onPlayLine?: (lineId: string) => void;

    // ── Footer ─────────────────────────────────────────────────────────────────
    footerVariant?: FooterVariant;
    ctaLabel?: string;
    /** "Continue Learning" handler — existing, unchanged */
    onCtaClick?: () => void;

    className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function TranscriptPanel({
    status,
    headerVariant = "none",
    activeToggle,
    onToggle,
    lines = [],
    activeLineId,
    onLineClick,
    onPlayLine,
    footerVariant = "none",
    ctaLabel = "Continue Learning",
    onCtaClick,
    className,
}: TranscriptPanelProps) {
    return (
        <div
            className={cn(
                "flex flex-col h-full",
                "bg-white dark:bg-slate-900",
                "rounded-xl shadow-sm",
                "border border-slate-200 dark:border-slate-800",
                "overflow-hidden",
                className
            )}
        >
            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div className="flex-none flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                {/* Title */}
                <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Transcript
                </h3>

                {/* Right slot */}
                {headerVariant === "draft" && (
                    <Badge
                        variant="secondary"
                        className="text-[10px] uppercase tracking-widest font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border-0"
                    >
                        Draft
                    </Badge>
                )}

                {headerVariant === "toggle-translation" && (
                    <div className="flex gap-2">
                        <ToggleButton
                            label="Translation"
                            active={activeToggle === "translation"}
                            onClick={() => onToggle?.("translation")}
                        />
                        <ToggleButton
                            label="Phonetics"
                            active={activeToggle === "phonetics"}
                            onClick={() => onToggle?.("phonetics")}
                        />
                    </div>
                )}

                {headerVariant === "toggle-lang" && (
                    <div className="flex h-9 items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1 gap-0.5">
                        {["English", "Original"].map((val) => {
                            const isActive = (activeToggle ?? "English") === val;
                            return (
                                <button
                                    key={val}
                                    onClick={() => onToggle?.(val)}
                                    className={cn(
                                        "flex-1 px-3 h-full rounded-md text-sm font-medium transition-all",
                                        isActive
                                            ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-semibold"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                                    )}
                                >
                                    {val}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Body ───────────────────────────────────────────────────────────── */}
            {status === "empty" ? (
                <EmptyState />
            ) : (
                <ScrollArea className="flex-1">
                    <div className="p-4 flex flex-col gap-4">
                        {lines.map((line) => {
                            const isActive = line.id === activeLineId;
                            return (
                                <TranscriptLineItem
                                    key={line.id}
                                    line={line}
                                    isActive={isActive}
                                    onClick={() => onLineClick?.(line.id, line.startTime)}
                                    onPlay={() => onPlayLine?.(line.id)}
                                />
                            );
                        })}
                    </div>
                </ScrollArea>
            )}

            {/* ── Footer ─────────────────────────────────────────────────────────── */}
            {footerVariant === "info" && (
                <div className="flex-none p-4 bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Info className="h-3.5 w-3.5 flex-none" />
                        <span>AI will analyze audio for precision.</span>
                    </div>
                </div>
            )}

            {footerVariant === "cta" && (
                <div className="flex-none p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800">
                    <Button
                        onClick={onCtaClick}
                        className={cn(
                            "w-full py-6 rounded-xl font-bold text-base",
                            "bg-primary hover:bg-primary/90 text-white",
                            "shadow-lg shadow-primary/20",
                            "flex items-center justify-center gap-3",
                            "transition-transform active:scale-[0.98]"
                        )}
                    >
                        <PlayCircle className="h-5 w-5" />
                        {ctaLabel}
                    </Button>
                </div>
            )}
        </div>
    );
}

// ─── TranscriptLineItem ───────────────────────────────────────────────────────
type TranscriptLineItemProps = {
    line: TranscriptLine;
    isActive: boolean;
    onClick: () => void;
    onPlay: () => void;
};

function TranscriptLineItem({
    line,
    isActive,
    onClick,
    onPlay,
}: TranscriptLineItemProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "p-4 rounded-xl transition-colors cursor-pointer group",
                isActive
                    ? "bg-primary/5 border-l-4 border-primary"
                    : "border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
            )}
        >
            {/* Timestamp row */}
            <div className="flex items-start justify-between mb-1">
                <span
                    className={cn(
                        "text-xs font-bold font-mono",
                        isActive ? "text-primary" : "text-slate-400"
                    )}
                >
                    {line.timestamp}
                </span>

                {/* Volume icon (active) / Play icon (inactive) */}
                {isActive ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); onPlay(); }}
                        className="text-primary hover:opacity-70 transition-opacity"
                        aria-label="Play line"
                    >
                        <Volume2 className="h-4 w-4" />
                    </button>
                ) : (
                    <PlayCircle className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all" />
                )}
            </div>

            {/* Native text */}
            <p
                className={cn(
                    "leading-relaxed mb-1",
                    isActive
                        ? "text-lg font-bold text-slate-900 dark:text-slate-100"
                        : "text-base font-medium text-slate-700 dark:text-slate-300"
                )}
            >
                {line.text}
            </p>

            {/* Transliteration */}
            {line.transliteration && (
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 italic">
                    {line.transliteration}
                </p>
            )}

            {/* Translation — separated by top border on active line */}
            {line.translation && (
                <p
                    className={cn(
                        "text-sm text-slate-600 dark:text-slate-300",
                        isActive && "mt-2 pt-2 border-t border-primary/10"
                    )}
                >
                    {line.translation}
                </p>
            )}
        </div>
    );
}

// ─── ToggleButton (Translation / Phonetics) ───────────────────────────────────
type ToggleButtonProps = {
    label: string;
    active: boolean;
    onClick: () => void;
};

function ToggleButton({ label, active, onClick }: ToggleButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                "flex items-center gap-1",
                active
                    ? "bg-primary text-white shadow-sm"
                    : "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 shadow-sm text-slate-700 dark:text-slate-200 hover:border-primary"
            )}
        >
            {label}
        </button>
    );
}

// ─── EmptyState (Screen 1 — waiting for video) ────────────────────────────────
function EmptyState() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            {/* Pulsing icon */}
            <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-4">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>

            <h3 className="text-slate-900 dark:text-white font-semibold mb-2">
                Waiting for video...
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-[200px]">
                Confirm your settings to generate the synchronized transcript.
            </p>

            {/* Skeleton lines */}
            <div className="mt-8 w-full flex flex-col gap-3">
                {[
                    "w-full opacity-100",
                    "w-5/6 opacity-80",
                    "w-4/6 opacity-60",
                    "w-full opacity-40",
                    "w-2/3 opacity-20",
                ].map((classes, i) => (
                    <div
                        key={i}
                        className={cn(
                            "h-4 bg-slate-100 dark:bg-slate-800 rounded",
                            classes
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

export default TranscriptPanel;