"use client";

import { useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type SceneLine = {
    id: string;
    speaker: "NPC" | "USER";
    text: string;
    startTime: number;
    endTime: number;
};

type ScriptPanelProps = {
    script: SceneLine[];
    currentUserIndex: number;       // index into USER-only lines array
    roleplayActive: boolean;
    isPausedForRecording: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function ScriptPanel({
    script,
    currentUserIndex,
    roleplayActive,
    isPausedForRecording,
}: ScriptPanelProps) {
    // Build user-lines index map: lineId → userLineIndex
    // so we can identify which script lines are the "current" USER line
    const userLines = script.filter((l) => l.speaker === "USER");
    const activeUserLine = userLines[currentUserIndex] ?? null;

    // Auto-scroll active line into view
    const activeLineRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (activeLineRef.current) {
            activeLineRef.current.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        }
    }, [currentUserIndex, isPausedForRecording]);

    if (!script.length) return null;

    return (
        <div className="flex flex-col gap-1">
            {script.map((line) => {
                const isActiveUserLine =
                    roleplayActive &&
                    line.speaker === "USER" &&
                    activeUserLine?.id === line.id;

                const isPastUserLine =
                    line.speaker === "USER" &&
                    userLines.findIndex((l) => l.id === line.id) < currentUserIndex;

                return (
                    <div
                        key={line.id}
                        ref={isActiveUserLine ? activeLineRef : undefined}
                        className={[
                            "px-3 py-2 rounded transition-all duration-200 text-sm leading-snug",
                            // Active USER line waiting to be recorded
                            isActiveUserLine && isPausedForRecording
                                ? "bg-amber-50 border border-amber-300 shadow-sm"
                                : "",
                            // Active USER line (roleplay running, not yet paused)
                            isActiveUserLine && !isPausedForRecording
                                ? "bg-blue-50 border border-blue-200"
                                : "",
                            // Past USER lines (already recorded or skipped)
                            isPastUserLine ? "opacity-40" : "",
                            // NPC lines during roleplay (slightly dimmed)
                            roleplayActive && line.speaker === "NPC" && !isActiveUserLine
                                ? "opacity-70"
                                : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                    >
                        {/* Speaker label */}
                        <span
                            className={`text-xs font-semibold mr-2 uppercase tracking-wide ${line.speaker === "USER" ? "text-blue-600" : "text-gray-400"
                                }`}
                        >
                            {line.speaker}
                        </span>

                        {/* Line text */}
                        <span
                            className={
                                line.speaker === "USER" ? "font-medium" : "text-gray-600"
                            }
                        >
                            {line.text}
                        </span>

                        {/* "Your turn" badge on the active line when paused */}
                        {isActiveUserLine && isPausedForRecording && (
                            <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full bg-amber-200 text-amber-800 font-semibold">
                                Your turn
                            </span>
                        )}

                        {/* Checkmark for recorded lines */}
                        {isPastUserLine && (
                            <span className="ml-2 text-green-500 text-xs">✓ recorded</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
