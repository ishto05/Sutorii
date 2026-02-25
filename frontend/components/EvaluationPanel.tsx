"use client";

// ─── Types ────────────────────────────────────────────────────────────────────
type EvaluationResult = {
    evaluationId: string;
    sceneId: string;
    lineId: string;
    transcript: string;
    scores: {
        overall: number;
    };
    wordScores: any[];
    feedback: {
        summary: string;
    };
};

type EvaluationPanelProps = {
    results: EvaluationResult[];
    // Map lineId → expected text so we can show what was expected
    expectedTexts: Record<string, string>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-amber-500";
    return "text-red-500";
}

function scoreLabel(score: number): string {
    if (score >= 80) return "Great";
    if (score >= 50) return "OK";
    return "Needs work";
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EvaluationPanel({
    results,
    expectedTexts,
}: EvaluationPanelProps) {
    if (!results.length) return null;

    const avgScore =
        results.reduce((sum, r) => sum + (r.scores?.overall ?? 0), 0) /
        results.length;

    return (
        <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            {/* ── Header with overall average ── */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">
                    Evaluation Results
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Average score</span>
                    <span className={`text-lg font-bold ${scoreColor(avgScore)}`}>
                        {Math.round(avgScore)}%
                    </span>
                </div>
            </div>

            {/* ── Per-line results ── */}
            <div className="divide-y divide-gray-100">
                {results.map((result, index) => {
                    const score = result.scores?.overall ?? 0;
                    const expected = expectedTexts[result.lineId] ?? "—";

                    return (
                        <div key={result.evaluationId ?? index} className="px-4 py-3">
                            {/* Line number + score */}
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                    Line {index + 1}
                                </span>
                                <span
                                    className={`text-sm font-bold ${scoreColor(score)}`}
                                    title={`${scoreLabel(score)}`}
                                >
                                    {Math.round(score)}% — {scoreLabel(score)}
                                </span>
                            </div>

                            {/* Expected vs transcribed */}
                            <div className="mb-1">
                                <p className="text-xs text-gray-400">Expected</p>
                                <p className="text-sm text-gray-700">{expected}</p>
                            </div>

                            {result.transcript && (
                                <div className="mb-1">
                                    <p className="text-xs text-gray-400">You said</p>
                                    <p className="text-sm text-gray-700 italic">
                                        "{result.transcript}"
                                    </p>
                                </div>
                            )}

                            {/* AI feedback */}
                            {result.feedback?.summary && (
                                <p className="text-xs text-blue-600 mt-1">
                                    💬 {result.feedback.summary}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Debug JSON (MVP transparency) ── */}
            <details className="border-t border-gray-100">
                <summary className="px-4 py-2 text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                    Raw JSON
                </summary>
                <pre className="px-4 pb-3 text-xs whitespace-pre-wrap font-mono text-gray-500 overflow-x-auto">
                    {JSON.stringify(results, null, 2)}
                </pre>
            </details>
        </div>
    );
}
