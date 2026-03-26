"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type TheaterLayoutProps = {
    /** Left column — video player area (flex-1, fills remaining space) */
    videoPanel: React.ReactNode;
    /** Right column — transcript panel (fixed w-[400px]) */
    transcriptPanel: React.ReactNode;
    className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
// Full-screen immersive layout for Theater Mode.
// Dark-only — no light mode variant by design.
// No header, no footer at this level — fully self-contained.
export function TheaterLayout({
    videoPanel,
    transcriptPanel,
    className,
}: TheaterLayoutProps) {
    return (
        <div
            className={cn(
                // Full viewport, no scroll at page level
                "h-screen overflow-hidden",
                // Dark theme tokens — matches #0a0a0b from reference
                "bg-[#0a0a0b] text-slate-200 font-sans",
                "flex flex-col",
                className
            )}
        >
            <main className="flex flex-1 h-full overflow-hidden">

                {/* ── Left: Video panel (fills remaining space) ──────────────────── */}
                <section className="flex-1 flex flex-col relative bg-black overflow-hidden">
                    {videoPanel}
                </section>

                {/* ── Right: Transcript panel (fixed width) ──────────────────────── */}
                <aside
                    className={cn(
                        "w-[400px] flex-none flex flex-col",
                        "bg-[#0a0a0b]",
                        "border-l border-white/5"
                    )}
                >
                    {transcriptPanel}
                </aside>

            </main>
        </div>
    );
}

export default TheaterLayout;
