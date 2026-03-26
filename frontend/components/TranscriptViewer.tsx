"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ViewerLine = {
    id: string;
    timestamp: string;              // e.g. "00:00"
    speakerLabel: string;           // e.g. "SPEAKER 1 (TONY STARK)"
    text: string;
    translation?: string | null;
    phonetics?: string | null;
};

type TranscriptViewerProps = {
    lines: ViewerLine[];

    // ── Toggle state — all driven from parent, no internal state ────────────────
    showTimestamps: boolean;
    onShowTimestampsChange: (value: boolean) => void;

    showTranslation: boolean;
    onShowTranslationChange: (value: boolean) => void;

    showPhonetics: boolean;
    onShowPhoneticsChange: (value: boolean) => void;

    // ── Footer actions — existing handlers, passed through unchanged ────────────
    onBackToPlayer: () => void;
    onEditTranscript: () => void;
    onSaveChanges: () => void;

    className?: string;
};

// ─── Speaker badge color ──────────────────────────────────────────────────────
// Deterministic color from speaker label — keeps same color per speaker
// across renders without storing state. Uses primary tint for speaker 1,
// slate for all others (matches reference exactly).
function getSpeakerStyle(label: string): { bg: string; text: string } {
    const lower = label.toLowerCase();
    // Speaker 1 / protagonist gets primary tint — matches reference
    if (lower.includes("speaker 1") || lower.includes("speaker_00")) {
        return { bg: "bg-primary/10", text: "text-primary/80" };
    }
    return {
        bg: "bg-slate-200 dark:bg-slate-700",
        text: "text-slate-600 dark:text-slate-300",
    };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TranscriptViewer({
    lines,
    showTimestamps,
    onShowTimestampsChange,
    showTranslation,
    onShowTranslationChange,
    showPhonetics,
    onShowPhoneticsChange,
    onBackToPlayer,
    onEditTranscript,
    onSaveChanges,
    className,
}: TranscriptViewerProps) {
    return (
        <>
            {/* ── Transcript card ─────────────────────────────────────────────────── */}
            <Card
                className={cn(
                    "shadow-sm border-slate-200 dark:border-slate-800",
                    "bg-white dark:bg-slate-900 overflow-hidden",
                    className
                )}
            >
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">
                        Transcript
                    </h3>

                    {/* Toggles */}
                    <div className="flex flex-wrap items-center gap-6">
                        <ToggleSwitch
                            id="timestamps"
                            label="Time Stamps"
                            checked={showTimestamps}
                            onCheckedChange={onShowTimestampsChange}
                        />
                        <ToggleSwitch
                            id="translation"
                            label="Translation"
                            checked={showTranslation}
                            onCheckedChange={onShowTranslationChange}
                        />
                        <ToggleSwitch
                            id="phonetics"
                            label="Phonetics"
                            checked={showPhonetics}
                            onCheckedChange={onShowPhoneticsChange}
                        />
                    </div>
                </div>

                {/* Lines */}
                <ScrollArea>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {lines.map((line, i) => {
                            const speakerStyle = getSpeakerStyle(line.speakerLabel);
                            const isEven = i % 2 === 1;

                            return (
                                <div
                                    key={line.id}
                                    className={cn(
                                        "p-6 transition-colors",
                                        "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                                        isEven && "bg-slate-50/30 dark:bg-slate-800/20",
                                        // Grid shifts when timestamps are hidden
                                        showTimestamps
                                            ? "grid grid-cols-[80px_1fr] gap-6"
                                            : "grid grid-cols-[1fr] gap-0"
                                    )}
                                >
                                    {/* Timestamp */}
                                    {showTimestamps && (
                                        <span className="text-slate-400 dark:text-slate-500 font-mono text-sm pt-1 tabular-nums">
                                            {line.timestamp}
                                        </span>
                                    )}

                                    {/* Content */}
                                    <div className="flex flex-col gap-2">
                                        {/* Speaker badge */}
                                        <span
                                            className={cn(
                                                "inline-block self-start",
                                                "text-[10px] font-black uppercase tracking-widest",
                                                "px-2 py-0.5 rounded",
                                                speakerStyle.bg,
                                                speakerStyle.text
                                            )}
                                        >
                                            {line.speakerLabel}
                                        </span>

                                        {/* Line text */}
                                        <p className="text-lg leading-relaxed font-medium text-slate-800 dark:text-slate-200">
                                            {line.text}
                                        </p>

                                        {/* Phonetics — shown when toggle is on */}
                                        {showPhonetics && line.phonetics && (
                                            <p className="text-sm text-slate-500 dark:text-slate-400 italic font-medium">
                                                {line.phonetics}
                                            </p>
                                        )}

                                        {/* Translation — shown when toggle is on */}
                                        {showTranslation && line.translation && (
                                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                                {line.translation}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </Card>

            {/* ── Sticky footer action bar ─────────────────────────────────────────── */}
            <footer className="sticky bottom-0 w-full border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-6 md:px-10 py-4 -mx-6 md:-mx-10">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    {/* Back */}
                    <Button
                        variant="ghost"
                        onClick={onBackToPlayer}
                        className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-bold hover:text-slate-900 dark:hover:text-slate-100 group px-0"
                    >
                        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                        Back to Player
                    </Button>

                    {/* Right actions */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            onClick={onEditTranscript}
                            className="px-5 border-primary text-primary font-bold hover:bg-primary/5 dark:hover:bg-primary/10"
                        >
                            Edit Transcript
                        </Button>
                        <Button
                            onClick={onSaveChanges}
                            className="px-5 bg-primary hover:bg-primary/90 text-white font-bold shadow-lg shadow-primary/20"
                        >
                            Save Changes
                        </Button>
                    </div>
                </div>
            </footer>
        </>
    );
}

// ─── ToggleSwitch ─────────────────────────────────────────────────────────────
type ToggleSwitchProps = {
    id: string;
    label: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
};

function ToggleSwitch({ id, label, checked, onCheckedChange }: ToggleSwitchProps) {
    return (
        <div className="flex items-center gap-2">
            <Label
                htmlFor={id}
                className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none"
            >
                {label}
            </Label>
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                className="data-[state=checked]:bg-primary"
            />
        </div>
    );
}

export default TranscriptViewer;