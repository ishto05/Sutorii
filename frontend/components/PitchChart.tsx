"use client";

import * as React from "react";
import { PlayCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type StatVariant = "default" | "good" | "warning";

type PitchStat = {
    label: string;
    value: string;
    variant?: StatVariant;
};

type TimeLabel = {
    label: string;
    active?: boolean; // highlighted in primary color
};

type PitchChartProps = {
    // ── Pitch data ──────────────────────────────────────────────────────────────
    /** Raw Hz values — 0 = unvoiced. Passed from existing pitchMap in page.tsx */
    pitchPoints?: number[];
    /** 0–1 ratio — drives the dashed playhead position */
    currentTimeRatio?: number;
    /** Time axis labels e.g. ["00:00","00:30","01:00",...] */
    timeLabels?: TimeLabel[];

    // ── Stats row ────────────────────────────────────────────────────────────────
    stats?: PitchStat[];

    // ── Tab state — existing handlers, unchanged ────────────────────────────────
    activeTab?: string;
    onTabChange?: (tab: string) => void;
    onStartPlaying?: () => void;

    // ── Slots for other tabs ────────────────────────────────────────────────────
    overviewContent?: React.ReactNode;
    feedbackContent?: React.ReactNode;

    className?: string;
};

// ─── Stat variant colors ──────────────────────────────────────────────────────
const statValueClass: Record<StatVariant, string> = {
    default: "text-slate-900 dark:text-white",
    good: "text-emerald-500",
    warning: "text-amber-500",
};

// ─── SVG chart builder ────────────────────────────────────────────────────────
// Converts raw pitchPoints (Hz) into a smooth SVG path string.
// Voiced segments (> 0) are drawn; unvoiced (0) create gaps via Move commands.
function buildPitchPath(
    points: number[],
    width: number,
    height: number,
    padding = 12
): { linePath: string; fillPath: string } {
    if (!points.length) return { linePath: "", fillPath: "" };

    const voiced = points.filter((v) => v > 0);
    if (!voiced.length) return { linePath: "", fillPath: "" };

    const minHz = Math.min(...voiced);
    const maxHz = Math.max(...voiced);
    const range = maxHz - minHz || 1;

    // Map Hz value → Y coordinate (inverted — high pitch = low Y)
    const toY = (hz: number) =>
        padding + ((maxHz - hz) / range) * (height - padding * 2);

    const toX = (i: number) => (i / (points.length - 1)) * width;

    let linePath = "";
    let fillPath = "";
    let inSegment = false;
    let segmentStart = 0;

    points.forEach((hz, i) => {
        const x = toX(i);
        const y = hz > 0 ? toY(hz) : 0;

        if (hz > 0) {
            if (!inSegment) {
                linePath += `M ${x} ${y} `;
                segmentStart = x;
                inSegment = true;
            } else {
                // Smooth curve using cubic bezier approximation
                const prevX = toX(i - 1);
                const prevY = toY(points[i - 1] || hz);
                const cpX = (prevX + x) / 2;
                linePath += `C ${cpX} ${prevY}, ${cpX} ${y}, ${x} ${y} `;
            }
        } else {
            if (inSegment) {
                // Close fill segment
                const prevX = toX(i - 1);
                fillPath += `${linePath} L ${prevX} ${height} L ${segmentStart} ${height} Z `;
                inSegment = false;
            }
        }
    });

    // Close last open segment
    if (inSegment) {
        const lastX = toX(points.length - 1);
        fillPath += `${linePath} L ${lastX} ${height} L ${segmentStart} ${height} Z `;
    }

    return { linePath, fillPath };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function PitchChart({
    pitchPoints = [],
    currentTimeRatio = 0.25,
    timeLabels = [
        { label: "00:00" },
        { label: "00:30" },
        { label: "01:00", active: true },
        { label: "01:30" },
        { label: "02:00" },
        { label: "02:30" },
    ],
    stats = [],
    activeTab = "pitch",
    onTabChange,
    onStartPlaying,
    overviewContent,
    feedbackContent,
    className,
}: PitchChartProps) {
    const chartWidth = 1000;
    const chartHeight = 256;

    const { linePath, fillPath } = React.useMemo(
        () => buildPitchPath(pitchPoints, chartWidth, chartHeight),
        [pitchPoints]
    );

    // Fallback demo path when no real data yet (matches reference visual)
    const demoLinePath =
        "M0 160 Q 50 140, 100 180 T 200 120 T 300 200 T 400 100 T 500 160 T 600 80 T 700 180 T 800 130 T 900 170 L 1000 150";
    const demoFillPath =
        "M0 160 Q 50 140, 100 180 T 200 120 T 300 200 T 400 100 T 500 160 T 600 80 T 700 180 T 800 130 T 900 170 L 1000 150 L 1000 256 L 0 256 Z";

    const activeLine = pitchPoints.length > 0 ? linePath : demoLinePath;
    const activeFill = pitchPoints.length > 0 ? fillPath : demoFillPath;
    const playheadX = `${Math.min(100, Math.max(0, currentTimeRatio * 100))}%`;

    return (
        <div
            className={cn(
                "bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden",
                className
            )}
        >
            <Tabs
                value={activeTab}
                onValueChange={onTabChange}
                defaultValue="pitch"
            >
                {/* ── Tab bar ──────────────────────────────────────────────────────── */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6">
                    <TabsList className="h-auto bg-transparent p-0 gap-8 rounded-none justify-start">
                        {[
                            { value: "overview", label: "Overview" },
                            { value: "pitch", label: "Pitch" },
                            { value: "feedback", label: "Feedback" },
                        ].map((tab) => (
                            <TabsTrigger
                                key={tab.value}
                                value={tab.value}
                                className={cn(
                                    "px-1 pb-3 pt-4 rounded-none border-b-2 border-transparent",
                                    "text-sm font-semibold text-slate-500 dark:text-slate-400",
                                    "hover:text-slate-700 dark:hover:text-slate-200",
                                    "data-[state=active]:border-primary data-[state=active]:text-primary",
                                    "data-[state=active]:font-bold data-[state=active]:shadow-none",
                                    "bg-transparent data-[state=active]:bg-transparent",
                                    "-mb-[1px]"
                                )}
                            >
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* ── Pitch tab ────────────────────────────────────────────────────── */}
                <TabsContent value="pitch" className="p-6 pb-0">

                    {/* Header + legend */}
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                Intonation Analysis
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                Tracking pitch variation across the timeline
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <LegendDot color="bg-emerald-500" label="Pitch Frequency" />
                            <LegendDot color="bg-slate-200 dark:bg-slate-700" label="Baseline" />
                        </div>
                    </div>

                    {/* SVG chart */}
                    <div className="relative w-full h-64 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                        {/* Grid lines */}
                        <div className="absolute inset-0 grid grid-rows-4 pointer-events-none">
                            {[0, 1, 2].map((i) => (
                                <div
                                    key={i}
                                    className="border-b border-slate-200/50 dark:border-slate-800/50"
                                />
                            ))}
                        </div>

                        {/* Fill area */}
                        <svg
                            className="absolute inset-0 w-full h-full opacity-10"
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                            preserveAspectRatio="none"
                        >
                            <path d={activeFill} fill="#10b981" />
                        </svg>

                        {/* Line */}
                        <svg
                            className="absolute inset-0 w-full h-full drop-shadow-sm"
                            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                            preserveAspectRatio="none"
                        >
                            <path
                                d={activeLine}
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                            {/* Playhead */}
                            <line
                                x1={playheadX}
                                x2={playheadX}
                                y1="0"
                                y2="100%"
                                stroke="#1313ec"
                                strokeWidth="2"
                                strokeDasharray="4"
                            />
                        </svg>
                    </div>

                    {/* Time labels */}
                    <div className="flex justify-between mt-3 px-2 text-[10px] font-mono uppercase tracking-widest">
                        {timeLabels.map((t, i) => (
                            <span
                                key={i}
                                className={
                                    t.active
                                        ? "text-primary font-bold"
                                        : "text-slate-400 dark:text-slate-600"
                                }
                            >
                                {t.label}
                            </span>
                        ))}
                    </div>
                </TabsContent>

            </Tabs>

            {/* ── Stats row — always visible below tabs ────────────────────────── */}
            {stats.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
                    {stats.map((stat, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {stat.label}
                            </span>
                            <span
                                className={cn(
                                    "text-lg font-bold",
                                    statValueClass[stat.variant ?? "default"]
                                )}
                            >
                                {stat.value}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── LegendDot ────────────────────────────────────────────────────────────────
function LegendDot({ color, label }: { color: string; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className={cn("size-2 rounded-full flex-none", color)} />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                {label}
            </span>
        </div>
    );
}

export default PitchChart;