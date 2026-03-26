const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

import { useSutoriiStore } from "@/store/sutorii";

/** 
 * Central fetch wrapper that logs everything to our Zustand debug store.
 * Handles FormData logging and JSON parsing automatically.
 */
async function apiFetch(url: string, options: RequestInit) {
    const startTime = Date.now();
    const logId = Math.random().toString(36).substring(7);

    // Capture request body for logs
    let requestBody: any = null;
    if (options.body instanceof FormData) {
        requestBody = Object.fromEntries(options.body.entries());
    } else if (typeof options.body === "string") {
        try { requestBody = JSON.parse(options.body); } catch { requestBody = options.body; }
    }

    try {
        const res = await fetch(url, options);
        const durationMs = Date.now() - startTime;
        
        // Get raw text first to avoid destructive .json() if we need to log it
        const text = await res.text();
        let responseData: any = null;
        try { responseData = JSON.parse(text); } catch { responseData = text; }

        // Log SUCCESS/FAIL to store
        useSutoriiStore.getState().addDebugLog({
            id: logId,
            timestamp: new Date().toISOString(),
            method: options.method || "GET",
            url,
            requestBody,
            responseStatus: res.status,
            responseBody: responseData,
            durationMs,
        });

        if (!res.ok) {
            throw new Error(typeof responseData === "string" ? responseData : responseData?.detail || JSON.stringify(responseData));
        }
        return responseData;
    } catch (error: any) {
        const durationMs = Date.now() - startTime;
        
        // Log CRASH to store
        useSutoriiStore.getState().addDebugLog({
            id: logId,
            timestamp: new Date().toISOString(),
            method: options.method || "GET",
            url,
            requestBody,
            error: error.message || "Unknown Network Error",
            durationMs,
        });
        throw error;
    }
}

// ─── Phase 1: Preview ─────────────────────────────────────────────────────────
// Calls POST /ingest with phase="preview"
// Backend should: fetch yt-dlp metadata only (no audio download), return fast
export type ScenePreview = {
    title: string;
    thumbnail_url: string;
    detected_language: string;   // ISO 639-1 e.g. "ja", "en", "ko"
    duration: number;            // seconds
};

export async function previewScene(youtubeUrl: string): Promise<ScenePreview> {
    return apiFetch(`${API_URL}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            youtube_url: youtubeUrl,
            phase: "preview",
        }),
    });
}

// ─── Phase 2: Confirm (full ingest) ──────────────────────────────────────────
// Calls POST /ingest with phase="confirm" + user-selected options
// Backend should: run full 7-phase pipeline and return ScenePackage
type ConfirmParams = {
    translation_language: string;
    native_language: string;
    transliteration_enabled: boolean;
};

export async function confirmIngest(youtubeUrl: string, params: ConfirmParams) {
    return apiFetch(`${API_URL}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            youtube_url: youtubeUrl,
            phase: "confirm",
            translation_language: params.translation_language,
            native_language: params.translation_language,
            transliteration_enabled: params.transliteration_enabled,
        }),
    });
}

// ─── Evaluation types (v2 session evaluation) ────────────────────────────────
export type EvaluationResult = {
    evaluationId: string;
    sceneId: string;
    lineId: string;
    expectedText: string;
    transcript: string;
    scores: {
        overall: number;
        textAccuracy: number;
        pronunciation: number;
        fluency: number;
        completeness: number;
        pitchAccuracy: number;   // -1 if unavailable
    };
    wordScores: {
        word: string;
        score: number;
        phonemes: { phoneme: string; score: number }[];
    }[];
    pitchFeedback: "good" | "flat" | "rising" | "falling" | "unavailable" | null;
    feedback: {
        summary: string;
        tips: string[];
    };
    metadata: Record<string, any>;
};

export type SessionEvaluation = {
    sessionId: string;
    sceneId: string;
    overallScore: number;
    linesEvaluated: number;
    lines: EvaluationResult[];
    sessionFeedback: string;
    metadata: Record<string, any>;
};

type EvaluateSessionParams = {
    sceneId: string;
    sourceLang: string;                          // ScenePackage.language — never hardcode
    recordings: {
        lineId: string;
        expectedText: string;
        audioBlob: Blob;
    }[];
    pitchMap?: Record<string, number[]>;         // from pitchMap state — enables DTW pitch scoring
};

// ─── Evaluate session (v2 — single call after session ends) ──────────────────
// Replaces the old per-line evaluateLine() loop entirely.
// FormData field naming is positional: line_0_id, line_0_text, line_0_audio, etc.
export async function evaluateSession(
    params: EvaluateSessionParams
): Promise<SessionEvaluation> {
    const form = new FormData();

    form.append("sceneId", params.sceneId);
    form.append("sourceLang", params.sourceLang);
    form.append("lineCount", String(params.recordings.length));

    // Optional: pass pitch data for DTW comparison
    if (params.pitchMap && Object.keys(params.pitchMap).length > 0) {
        form.append("pitchData", JSON.stringify(params.pitchMap));
    }

    // Positional fields
    params.recordings.forEach((rec, i) => {
        form.append(`line_${i}_id`, rec.lineId);
        form.append(`line_${i}_text`, rec.expectedText);
        form.append(`line_${i}_audio`, rec.audioBlob, `line_${i}.webm`);
    });

    return apiFetch(`${API_URL}/evaluate/session`, {
        method: "POST",
        body: form,
    });
}