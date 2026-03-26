"use client";

import * as React from "react";
import { Settings, Languages, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
export type TheaterLine = {
    id: string;
    timestamp: string;             // e.g. "02:14"
    startTime: number;             // seconds — for onLineClick
    text: string;
    translation?: string | null;
    phonetics?: string | null;
};

type TheaterTranscriptPanelProps = {
    // ── Lines ───────────────────────────────────────────────────────────────────
    lines: TheaterLine[];
    activeLineId?: string;
    onLineClick?: (lineId: string, startTime: number) => void;

    // ── Header toggles — existing state + handlers ──────────────────────────────
    showTranslation: boolean;
    onShowTranslationChange: (value: boolean) => void;
    showPhonetics: boolean;
    onShowPhoneticsChange: (value: boolean) => void;
    onSettingsClick?: () => void;
    onTranslationPhoneticsClick?: () => void;

    // ── Footer — roleplay toolbar, all existing handlers ────────────────────────
    speakerName: string;           // e.g. "Speaker_00"
    lineCount: number;             // e.g. 11
    isRecording: boolean;          // drives Record button state
    onRecord: () => void;
    onViewRecordings: () => void;

    className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function TheaterTranscriptPanel({
    lines,
    activeLineId,
    onLineClick,
    showTranslation,
    onShowTranslationChange,
    showPhonetics,
    onShowPhoneticsChange,
    onSettingsClick,
    onTranslationPhoneticsClick,
    speakerName,
    lineCount,
    isRecording,
    onRecord,
    onViewRecordings,
    className,
}: TheaterTranscriptPanelProps) {
    return (
        <div
            className={cn(
                "flex flex-col h-full",
                "bg-[#0a0a0b]",
                className
            )}
        >
            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <header className="flex-none p-6 border-b border-white/5 space-y-5">

                {/* Title row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Document icon */}
                        <svg
                            className="h-5 w-5 text-primary flex-none"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                            />
                        </svg>
                        <h2 className="text-lg font-semibold text-white tracking-tight">
                            Transcript
                        </h2>
                    </div>

                    {/* Settings icon */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onSettingsClick}
                        className="text-slate-400 hover:text-white hover:bg-transparent h-8 w-8"
                        aria-label="Transcript settings"
                    >
                        <Settings className="h-5 w-5" />
                    </Button>
                </div>

                {/* Translation & Phonetics button */}
                <Button
                    onClick={onTranslationPhoneticsClick}
                    className={cn(
                        "w-full bg-primary hover:bg-primary/90 text-white",
                        "py-2.5 font-medium text-sm",
                        "flex items-center justify-center gap-2",
                        "shadow-lg shadow-primary/20 rounded-[8px]"
                    )}
                >
                    <Languages className="h-4 w-4" />
                    Translation &amp; Phonetics
                </Button>

                {/* Toggles */}
                <div className="space-y-4 pt-1">
                    <TheaterToggle
                        id="theater-translation"
                        label="Translation"
                        checked={showTranslation}
                        onCheckedChange={onShowTranslationChange}
                    />
                    <TheaterToggle
                        id="theater-phonetics"
                        label="Phonetics"
                        checked={showPhonetics}
                        onCheckedChange={onShowPhoneticsChange}
                    />
                </div>
            </header>

            {/* ── Scrollable transcript body ────────────────────────────────────── */}
            <ScrollArea className="flex-1">
                <div className="p-6 space-y-6">
                    {lines.map((line) => {
                        const isActive = line.id === activeLineId;
                        return (
                            <TheaterLineItem
                                key={line.id}
                                line={line}
                                isActive={isActive}
                                showTranslation={showTranslation}
                                showPhonetics={showPhonetics}
                                onClick={() => onLineClick?.(line.id, line.startTime)}
                            />
                        );
                    })}
                </div>
            </ScrollArea>

            {/* ── Footer toolbar — roleplay controls ───────────────────────────── */}
            <footer className="flex-none p-4 border-t border-white/5 bg-[#161618] grid grid-cols-2 gap-2">
                {/* Speaker name */}
                <Button
                    variant="ghost"
                    className="bg-[#27272a] hover:bg-slate-700 text-slate-300 text-xs py-2 h-auto rounded font-medium justify-center"
                >
                    {speakerName}
                </Button>

                {/* Line count */}
                <Button
                    variant="ghost"
                    className="bg-[#27272a] hover:bg-slate-700 text-slate-300 text-xs py-2 h-auto rounded font-medium justify-center"
                >
                    {lineCount} Lines
                </Button>

                {/* Record button */}
                <Button
                    onClick={onRecord}
                    variant="ghost"
                    className={cn(
                        "text-xs py-2 h-auto rounded font-medium justify-center",
                        isRecording
                            ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                            : "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                    )}
                >
                    {isRecording ? "● Recording…" : "Record"}
                </Button>

                {/* Recordings */}
                <Button
                    onClick={onViewRecordings}
                    variant="ghost"
                    className="bg-[#27272a] hover:bg-slate-700 text-slate-300 text-xs py-2 h-auto rounded font-medium justify-center flex items-center gap-1"
                >
                    Recordings
                    <ChevronUp className="h-3 w-3" />
                </Button>
            </footer>
        </div>
    );
}

// ─── TheaterLineItem ──────────────────────────────────────────────────────────
type TheaterLineItemProps = {
    line: TheaterLine;
    isActive: boolean;
    showTranslation: boolean;
    showPhonetics: boolean;
    onClick: () => void;
};

function TheaterLineItem({
    line,
    isActive,
    showTranslation,
    showPhonetics,
    onClick,
}: TheaterLineItemProps) {
    return (
        <article
            onClick={onClick}
            className={cn(
                "cursor-pointer transition-colors",
                isActive
                    ? "relative pl-4 border-l-4 border-primary bg-[#27272a]/30 p-4 rounded-r-[8px]"
                    : "p-4 rounded-[8px] hover:bg-white/5 group"
            )}
        >
            {/* Timestamp */}
            <time
                className={cn(
                    "font-bold text-xs mb-2 block tracking-wider",
                    isActive
                        ? "text-primary"
                        : "text-slate-500 group-hover:text-slate-400"
                )}
            >
                {line.timestamp}
            </time>

            <div className="space-y-2">
                {/* Native text */}
                <p
                    className={cn(
                        "text-[15px] leading-relaxed",
                        isActive
                            ? "text-white font-medium"
                            : "text-slate-300"
                    )}
                >
                    {line.text}
                </p>

                {/* Phonetics */}
                {showPhonetics && line.phonetics && (
                    <p className={cn(
                        "text-sm italic",
                        isActive ? "text-slate-300" : "text-slate-500"
                    )}>
                        {line.phonetics}
                    </p>
                )}

                {/* Translation */}
                {showTranslation && line.translation && (
                    <p className={cn(
                        "text-sm italic",
                        isActive ? "text-slate-400" : "text-slate-500"
                    )}>
                        {line.translation}
                    </p>
                )}
            </div>
        </article>
    );
}

// ─── TheaterToggle ────────────────────────────────────────────────────────────
type TheaterToggleProps = {
    id: string;
    label: string;
    checked: boolean;
    onCheckedChange: (value: boolean) => void;
};

function TheaterToggle({ id, label, checked, onCheckedChange }: TheaterToggleProps) {
    return (
        <div className="flex items-center justify-between">
            <Label
                htmlFor={id}
                className="text-sm font-medium text-slate-300 cursor-pointer select-none"
            >
                {label}
            </Label>
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onCheckedChange}
                className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-slate-700"
            />
        </div>
    );
}

export default TheaterTranscriptPanel;