"use client";

import { useEffect, useRef, memo, useMemo } from "react";
import { useSutoriiStore } from "@/store/sutorii";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────
export type WordToken = {
    word: string;
    reading?: string | null;
    meaning?: string | null;
    startTime?: number | null;
    endTime?: number | null;
};

type SceneLine = {
    id: string;
    characterName: string;
    text: string;
    phoneticReading?: string | null;
    transliteration?: string | null;
    translation?: string | null;
    startTime: number;
    endTime: number;
    words?: WordToken[];
};

type ScriptPanelProps = {
    script: SceneLine[];
    selectedCharacter: string;
    currentUserIndex: number;
    roleplayActive: boolean;
    isPausedForRecording: boolean;
    selectedWord: { word: WordToken; lineId: string } | null;
    onWordClick: (word: WordToken, lineId: string) => void;
    speakerMappings?: Record<string, string>;
    currentTime?: number;
    activeLineId?: string | null;
};

// ─── Word Component (Memoized for performance) ────────────────────────────────
const WordItem = memo(function WordItem({
    w,
    lineId,
    isUserLine,
    isSelected,
    currentTime,
    isParentLineActive,
    onWordClick
}: {
    w: WordToken;
    lineId: string;
    isUserLine: boolean;
    isSelected: boolean;
    currentTime: number;
    isParentLineActive: boolean;
    onWordClick: (word: WordToken, lineId: string) => void;
}) {
    // Word-level highlight logic
    const isWordActive = isParentLineActive && (w.startTime ?? 0) <= currentTime && (w.endTime ?? Infinity) >= currentTime;

    return (
        <button
            onClick={() => onWordClick(w, lineId)}
            className={[
                "group relative mt-4 px-0.5 py-0.5 rounded transition-all duration-100",
                "text-sm leading-snug",
                isSelected
                    ? "bg-indigo-500/20 text-indigo-700 dark:text-indigo-200"
                    : isWordActive
                        ? "bg-primary/20 text-primary dark:text-primary font-bold shadow-sm"
                        : isUserLine
                            ? "text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700",
                w.meaning ? "cursor-pointer" : "cursor-default",
            ].filter(Boolean).join(" ")}
        >
            {/* Reading floats above on hover */}
            {w.reading && w.reading !== w.word && (
                <span className={[
                    "absolute -top-4 left-1/2 -translate-x-1/2",
                    "text-[9px] text-indigo-400 whitespace-nowrap",
                    "opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none",
                ].join(" ")}>
                    {w.reading}
                </span>
            )}
            {w.word}
        </button>
    );
});

// ─── Component ────────────────────────────────────────────────────────────────
const ScriptPanel = memo(function ScriptPanel({
    script,
    selectedCharacter,
    currentUserIndex,
    roleplayActive,
    isPausedForRecording,
    selectedWord,
    onWordClick,
    speakerMappings = {},
    currentTime = 0,
    activeLineId = null,
}: ScriptPanelProps) {
    const transliterationEnabled = useSutoriiStore(s => s.transliterationEnabled);

    const userLines = useMemo(() => script.filter((l) => l.characterName === selectedCharacter), [script, selectedCharacter]);
    const activeUserLine = userLines[currentUserIndex] ?? null;

    const activeLineRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to active line.
    useEffect(() => {
        if (activeLineRef.current) {
            activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [currentUserIndex, isPausedForRecording]);

    if (!script.length) return null;

    return (
        <ScrollArea className="h-[500px] w-full pr-4">
            <div className="flex flex-col gap-3 pb-4">
                {script.map((line) => {
                    const isUserLine = line.characterName === selectedCharacter;
                    const isActiveLine = isUserLine && activeUserLine?.id === line.id && roleplayActive;
                    const isPastLine =
                        isUserLine &&
                        userLines.findIndex((l) => l.id === line.id) < currentUserIndex;

                    // Compute generic active line using explicit targeted ID
                    const isGlobalActiveLine = activeLineId === line.id;

                    return (
                        <Card
                            key={line.id}
                            ref={isActiveLine ? activeLineRef : undefined}
                            className={[
                                "transition-all duration-200",
                                isActiveLine && isPausedForRecording
                                    ? "bg-amber-500/10 border-amber-500/40 shadow-sm"
                                    : "",
                                isActiveLine && !isPausedForRecording
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-slate-50 dark:bg-slate-800/50 border-transparent",
                                isPastLine ? "opacity-40" : "",
                                roleplayActive && !isUserLine && !isGlobalActiveLine ? "opacity-60" : "",
                            ].filter(Boolean).join(" ")}
                        >
                            <CardContent className="p-3">
                                {/* Speaker + badges */}
                                <div className="flex items-center gap-2 mb-2">
                                    <Badge 
                                        variant={isUserLine ? "default" : "secondary"} 
                                        className="text-[10px] uppercase tracking-widest px-2 py-0 h-5"
                                    >
                                        {speakerMappings[line.characterName] || line.characterName}
                                    </Badge>
                                    
                                    {isUserLine && (
                                        <span className="text-[10px] text-primary font-bold">(you)</span>
                                    )}
                                    
                                    {isActiveLine && isPausedForRecording && (
                                        <Badge variant="outline" className="ml-auto bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] h-5 px-1.5 gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            Your turn
                                        </Badge>
                                    )}
                                    {isPastLine && (
                                        <span className="ml-auto text-green-600 text-[10px]">✓</span>
                                    )}
                                </div>

                                <Separator className="mb-2 opacity-50 bg-slate-200 dark:bg-slate-700" />

                                {/* Word tokens */}
                                <div className="flex flex-wrap gap-y-1" style={{ gap: "0 0" }}>
                                    {line.words && line.words.length > 0 ? (
                                        line.words.map((w, i) => (
                                            <WordItem
                                                key={`${line.id}-${i}`}
                                                w={w}
                                                lineId={line.id}
                                                isUserLine={isUserLine}
                                                isSelected={
                                                    selectedWord?.lineId === line.id &&
                                                    selectedWord?.word.word === w.word &&
                                                    selectedWord?.word.startTime === w.startTime
                                                }
                                                currentTime={currentTime}
                                                isParentLineActive={isGlobalActiveLine || isActiveLine}
                                                onWordClick={onWordClick}
                                            />
                                        ))
                                    ) : (
                                        // Fallback text if no words
                                        <span className={isUserLine || isGlobalActiveLine
                                            ? "text-slate-800 dark:text-slate-200 font-medium text-sm mt-1"
                                            : "text-slate-600 dark:text-slate-400 text-sm mt-1"
                                        }>
                                            {line.text}
                                        </span>
                                    )}
                                </div>

                                {/* Transliteration */}
                                {transliterationEnabled && line.transliteration && (
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 font-medium">
                                        {line.transliteration}
                                    </p>
                                )}

                                {/* Translation */}
                                {line.translation && (!isUserLine || !roleplayActive) && (
                                    <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-1 italic">
                                        {line.translation}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </ScrollArea>
    );
});

export default ScriptPanel;