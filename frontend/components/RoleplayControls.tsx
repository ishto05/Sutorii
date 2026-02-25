"use client";

// ─── Props ────────────────────────────────────────────────────────────────────
type RoleplayControlsProps = {
    roleplayActive: boolean;
    sceneEnded: boolean;
    evaluationStarted: boolean;
    recordingCount: number;         // how many blobs are buffered
    onStart: () => void;
    onFinish: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function RoleplayControls({
    roleplayActive,
    sceneEnded,
    evaluationStarted,
    recordingCount,
    onStart,
    onFinish,
}: RoleplayControlsProps) {
    const canStart = !roleplayActive && !sceneEnded && !evaluationStarted;
    const canFinish = sceneEnded && !evaluationStarted && recordingCount > 0;
    const canSkipFinish = sceneEnded && !evaluationStarted && recordingCount === 0;

    return (
        <div className="flex items-center gap-3">
            {/* ── Start Roleplay ── */}
            {canStart && (
                <button
                    onClick={onStart}
                    className="px-5 py-2 rounded font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
                >
                    ▶ Start Roleplay
                </button>
            )}

            {/* ── Active indicator ── */}
            {roleplayActive && (
                <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    Roleplay in progress…
                </div>
            )}

            {/* ── Finish (batch evaluate) ── */}
            {(sceneEnded && !evaluationStarted) && (
                <button
                    onClick={onFinish}
                    disabled={!canFinish}
                    className={[
                        "px-5 py-2 rounded font-semibold text-white transition-colors shadow-sm",
                        canFinish
                            ? "bg-green-600 hover:bg-green-700 active:bg-green-800 cursor-pointer"
                            : "bg-gray-300 cursor-not-allowed",
                    ].join(" ")}
                >
                    ✓ Finish &amp; Evaluate
                </button>
            )}

            {/* ── Edge: scene ended but nothing was recorded ── */}
            {canSkipFinish && (
                <p className="text-xs text-gray-400 italic">
                    No recordings captured — nothing to evaluate.
                </p>
            )}

            {/* ── Evaluating spinner ── */}
            {evaluationStarted && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Evaluating recordings…
                </div>
            )}
        </div>
    );
}
