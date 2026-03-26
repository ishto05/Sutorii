"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
export type StatItem = {
    label: string;
    value: string;
    /** "default"  — plain value (Duration, Total Speakers)
     *  "success"  — value + green check icon (Transcription)
     *  "progress" — value + progress bar (Mapping Process) */
    variant?: "default" | "success" | "progress";
    /** Only used when variant="progress" — 0 to 100 */
    progressValue?: number;
    /** Label shown top-right on progress tile e.g. "89%" */
    progressLabel?: string;
};

type StatsBarProps = {
    stats: StatItem[];
    className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function StatsBar({ stats, className }: StatsBarProps) {
    return (
        <div
            className={cn(
                "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
                className
            )}
        >
            {stats.map((stat, i) => (
                <StatTile key={`${stat.label}-${i}`} stat={stat} />
            ))}
        </div>
    );
}

// ─── StatTile ─────────────────────────────────────────────────────────────────
function StatTile({ stat }: { stat: StatItem }) {
    const { label, value, variant = "default", progressValue = 0, progressLabel } = stat;

    return (
        <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardContent className="p-6">
                {/* Label row — progress tile has percentage on the right */}
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        {label}
                    </p>
                    {variant === "progress" && progressLabel && (
                        <span className="text-xs font-bold text-primary tabular-nums">
                            {progressLabel}
                        </span>
                    )}
                </div>

                {/* Value row */}
                {variant === "success" ? (
                    <div className="flex items-center gap-2">
                        <p className="text-2xl font-black text-slate-900 dark:text-slate-50">
                            {value}
                        </p>
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-none" />
                    </div>
                ) : (
                    <p className="text-2xl font-black text-slate-900 dark:text-slate-50 tabular-nums">
                        {value}
                    </p>
                )}

                {/* Progress bar — only on progress variant */}
                {variant === "progress" && (
                    <Progress
                        value={progressValue}
                        className="mt-4 h-2.5 bg-slate-100 dark:bg-slate-800 [&>div]:bg-primary"
                    />
                )}
            </CardContent>
        </Card>
    );
}

export default StatsBar;