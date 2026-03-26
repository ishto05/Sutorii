"use client";

import { useEffect, useRef, useState } from "react";

type SceneLine = {
    id: string;
    characterName: string;
    text: string;
    startTime: number;
    endTime: number;
};

type CharacterSelectProps = {
    uniqueCharacters: string[];
    script: SceneLine[];
    onSelect: (character: string) => void;
};

export default function CharacterSelect({
    uniqueCharacters,
    script,
    onSelect,
}: CharacterSelectProps) {
    const [selected, setSelected] = useState<string | null>(null);
    const [autoCountdown, setAutoCountdown] = useState<number | null>(null);

    // Count lines per character
    const lineCounts: Record<string, number> = {};
    uniqueCharacters.forEach((c) => {
        lineCounts[c] = script.filter((l) => l.characterName === c).length;
    });

    // Keep a ref to onSelect so the autoCountdown effect never needs it in deps.
    // Without this, every render creates a new onSelect reference (inline arrow
    // in parent) which re-triggers the effect → infinite setState loop.
    const onSelectRef = useRef(onSelect);
    useEffect(() => { onSelectRef.current = onSelect; });

    // Auto-select if only one character — show briefly then confirm
    useEffect(() => {
        if (uniqueCharacters.length === 1) {
            setSelected(uniqueCharacters[0]);
            setAutoCountdown(2);
        }
    }, [uniqueCharacters]);

    useEffect(() => {
        if (autoCountdown === null) return;
        if (autoCountdown === 0) {
            // Read from ref — stable reference, no re-trigger risk
            onSelectRef.current(uniqueCharacters[0]);
            return;
        }
        const t = setTimeout(() => setAutoCountdown((c) => (c ?? 1) - 1), 700);
        return () => clearTimeout(t);
        // onSelect intentionally excluded — use ref above instead
    }, [autoCountdown, uniqueCharacters]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleConfirm() {
        if (!selected) return;
        onSelect(selected);
    }

    return (
        <div className="flex flex-col gap-5">
            {/* Header */}
            <div>
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">
                    Step 2
                </p>
                <h2 className="text-base font-bold text-white leading-tight">
                    Choose your character
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                    You'll voice all their lines during roleplay
                </p>
            </div>

            {/* Character cards */}
            <div className="flex flex-col gap-2">
                {uniqueCharacters.map((char) => {
                    const isSelected = selected === char;
                    const count = lineCounts[char] ?? 0;

                    return (
                        <button
                            key={char}
                            onClick={() => {
                                setSelected(char);
                                setAutoCountdown(null); // cancel auto if user clicks
                            }}
                            className={[
                                "w-full text-left px-4 py-3 rounded-lg border transition-all duration-150",
                                "flex items-center justify-between gap-3",
                                isSelected
                                    ? "bg-indigo-600/20 border-indigo-500 shadow-sm shadow-indigo-500/20"
                                    : "bg-gray-800/60 border-gray-700 hover:border-gray-600 hover:bg-gray-800",
                            ].join(" ")}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                {/* Avatar circle */}
                                <div
                                    className={[
                                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-none",
                                        isSelected
                                            ? "bg-indigo-500 text-white"
                                            : "bg-gray-700 text-gray-400",
                                    ].join(" ")}
                                >
                                    {char.charAt(0).toUpperCase()}
                                </div>
                                <span
                                    className={[
                                        "text-sm font-semibold truncate",
                                        isSelected ? "text-white" : "text-gray-300",
                                    ].join(" ")}
                                >
                                    {char}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 flex-none">
                                <span className="text-xs text-gray-500 tabular-nums">
                                    {count} line{count !== 1 ? "s" : ""}
                                </span>
                                {isSelected && (
                                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                                            <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Auto-select notice */}
            {autoCountdown !== null && autoCountdown > 0 && (
                <p className="text-xs text-gray-500 text-center">
                    Only one character found — auto-selecting in{" "}
                    <span className="text-indigo-400 font-medium tabular-nums">{autoCountdown}</span>…
                </p>
            )}

            {/* Confirm button */}
            <button
                onClick={handleConfirm}
                disabled={!selected}
                className={[
                    "w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-150",
                    selected
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/30"
                        : "bg-gray-800 text-gray-600 cursor-not-allowed",
                ].join(" ")}
            >
                {selected ? `Play as ${selected} →` : "Select a character"}
            </button>
        </div>
    );
}