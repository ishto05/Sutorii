import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SessionEvaluation } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
export type DebugLog = {
    id: string;
    timestamp: string;
    method: string;
    url: string;
    requestBody?: any;
    responseStatus?: number;
    responseBody?: any;
    error?: string;
    durationMs?: number;
};

export type WordToken = {
    word: string;
    reading?: string | null;
    meaning?: string | null;
    startTime?: number | null;
    endTime?: number | null;
};

export type SceneLine = {
    id: string;
    characterName: string;
    text: string;
    phoneticReading?: string | null;
    transliteration?: string | null;
    translation?: string | null;
    startTime: number;
    endTime: number;
    words?: WordToken[];
    phonemes?: string[] | null;
    pitchPattern?: number[] | null;
};

export type ScenePackage = {
    sceneId: string;
    language: string;
    sourceLanguage: string;
    uniqueCharacters: string[];
    source: { type?: string; url?: string; youtube_url?: string;[key: string]: any };
    audio: any;
    script: SceneLine[];
    quiz?: any[];
    metadata: any;
};

export type Recording = {
    lineId: string;
    blob: Blob;
};

export type AppPhase =
    | "idle"
    | "ingesting"
    | "character_select"
    | "ready"
    | "roleplay"
    | "ended"
    | "evaluated";

// ─── Store shape ──────────────────────────────────────────────────────────────
type SutoriiState = {
    // ── Scene data ───────────────────────────────────────────────────────────────
    scenePackage: ScenePackage | null;
    selectedCharacter: string | null;
    appPhase: AppPhase;

    // ── Language settings (set on /setup, read on /play) ─────────────────────────
    videoTitle: string;
    translationLanguage: string;
    nativeLanguage: string;
    transliterationEnabled: boolean;

    // ── Speaker mappings (SPEAKER_00 → "Cho Samdal" etc.) ───────────────────────
    speakerMappings: Record<string, string>;

    // ── Pitch ────────────────────────────────────────────────────────────────────
    pitchMap: Record<string, number[]>;
    pitchLoading: boolean;

    // ── Roleplay ─────────────────────────────────────────────────────────────────
    recordings: Recording[];
    sessionEvaluation: SessionEvaluation | null;
    debugLogs: DebugLog[];

    // ── Actions ──────────────────────────────────────────────────────────────────
    setScenePackage: (scene: ScenePackage | null) => void;
    setSelectedCharacter: (character: string | null) => void;
    setAppPhase: (phase: AppPhase) => void;
    setLanguageSettings: (settings: {
        videoTitle?: string;
        translationLanguage: string;
        nativeLanguage: string;
        transliterationEnabled: boolean;
    }) => void;
    setSpeakerMappings: (mappings: Record<string, string>) => void;
    setPitchMap: (map: Record<string, number[]>) => void;
    setPitchLoading: (loading: boolean) => void;
    addRecording: (recording: Recording) => void;
    setRecordings: (recordings: Recording[]) => void;
    setSessionEvaluation: (session: SessionEvaluation | null) => void;
    addDebugLog: (log: DebugLog) => void;
    clearDebugLogs: () => void;

    // ── Reset helpers ────────────────────────────────────────────────────────────
    /** Full reset — called when starting a new scene from /setup */
    resetAll: () => void;
    /** Partial reset — called when restarting roleplay on /play */
    resetRoleplay: () => void;
};

// ─── Initial state ────────────────────────────────────────────────────────────
const initialState = {
    scenePackage: null,
    selectedCharacter: null,
    appPhase: "idle" as AppPhase,
    videoTitle: "",
    translationLanguage: "English",
    nativeLanguage: "en",
    transliterationEnabled: false,
    speakerMappings: {},
    pitchMap: {},
    pitchLoading: false,
    recordings: [],
    sessionEvaluation: null,
    debugLogs: [],
};

// ─── Store ────────────────────────────────────────────────────────────────────
// Persisted to sessionStorage so state survives Next.js route navigation
// but clears when the tab is closed (no stale scene data on next visit).
//
// NOTE: Blobs (recordings) are NOT serializable — they are excluded from
// persistence intentionally. Recordings only need to survive the /play → /results
// navigation within a single session, which sessionStorage handles fine as long
// as we don't hard-refresh between those two routes.
export const useSutoriiStore = create<SutoriiState>()(
    persist(
        (set) => ({
            ...initialState,

            setScenePackage: (scene) => set({ scenePackage: scene }),
            setSelectedCharacter: (character) => set({ selectedCharacter: character }),
            setAppPhase: (phase) => set({ appPhase: phase }),
            setLanguageSettings: (settings) => set(settings),
            setSpeakerMappings: (mappings) => set({ speakerMappings: mappings }),
            setPitchMap: (map) => set({ pitchMap: map }),
            setPitchLoading: (loading) => set({ pitchLoading: loading }),
            addRecording: (recording) =>
                set((state) => ({ recordings: [...state.recordings, recording] })),
            setRecordings: (recordings) => set({ recordings }),
            setSessionEvaluation: (session) => set({ sessionEvaluation: session }),
            addDebugLog: (log) => set((state) => ({ debugLogs: [log, ...state.debugLogs].slice(0, 50) })),
            clearDebugLogs: () => set({ debugLogs: [] }),

            resetAll: () => set({ ...initialState }),

            resetRoleplay: () =>
                set({
                    recordings: [],
                    appPhase: "ready",
                }),
        }),
        {
            name: "sutorii-session",
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                scenePackage: state.scenePackage,
                selectedCharacter: state.selectedCharacter,
                appPhase: state.appPhase,
                videoTitle: state.videoTitle,
                translationLanguage: state.translationLanguage,
                nativeLanguage: state.nativeLanguage,
                transliterationEnabled: state.transliterationEnabled,
                speakerMappings: state.speakerMappings,
                pitchMap: state.pitchMap,
                // recordings and debugLogs are not serializable or too large
            }),
        }
    )
);

// ─── Derived selectors ────────────────────────────────────────────────────────
// IMPORTANT: Zustand selectors must return stable references or primitives.
// Never return new arrays/objects inline (e.g. .filter(), .map()) — Zustand
// compares by reference and will loop if the result is always a new object.
// Instead, return the raw state slices and compute derived values with useMemo
// in the component.

/** Returns the raw script array + selectedCharacter for use with useMemo */
export function useScriptAndCharacter() {
    const script = useSutoriiStore((s) => s.scenePackage?.script ?? null);
    const selectedCharacter = useSutoriiStore((s) => s.selectedCharacter);
    return { script, selectedCharacter };
}

/** Returns the raw source object for URL extraction */
export function useSceneSource() {
    return useSutoriiStore((s) => s.scenePackage?.source ?? null);
}

/** Returns the raw pitchMap record */
export function usePitchMap() {
    return useSutoriiStore((s) => s.pitchMap);
}