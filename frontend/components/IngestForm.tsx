"use client";

import { useEffect, useState } from "react";
import { previewScene, ScenePreview } from "@/lib/api";

// ─── Language data ────────────────────────────────────────────────────────────
const TRANSLATION_LANGUAGES = [
    "English", "Japanese", "Korean", "Chinese (Simplified)", "Chinese (Traditional)",
    "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Russian",
    "Arabic", "Hindi", "Turkish", "Polish", "Swedish", "Norwegian", "Danish",
    "Finnish", "Czech", "Romanian", "Hungarian", "Thai", "Vietnamese", "Indonesian",
    "Malay", "Ukrainian", "Greek", "Hebrew", "Persian", "Catalan", "Croatian",
    "Slovak", "Bulgarian",
];

const NATIVE_LANGUAGES: { label: string; code: string }[] = [
    { label: "English", code: "en" },
    { label: "Japanese", code: "ja" },
    { label: "Korean", code: "ko" },
    { label: "Chinese (Simplified)", code: "zh" },
    { label: "Chinese (Traditional)", code: "zh-TW" },
    { label: "Spanish", code: "es" },
    { label: "French", code: "fr" },
    { label: "German", code: "de" },
    { label: "Portuguese", code: "pt" },
    { label: "Italian", code: "it" },
    { label: "Dutch", code: "nl" },
    { label: "Russian", code: "ru" },
    { label: "Arabic", code: "ar" },
    { label: "Hindi", code: "hi" },
    { label: "Turkish", code: "tr" },
    { label: "Polish", code: "pl" },
    { label: "Swedish", code: "sv" },
    { label: "Norwegian", code: "no" },
    { label: "Danish", code: "da" },
    { label: "Finnish", code: "fi" },
    { label: "Czech", code: "cs" },
    { label: "Romanian", code: "ro" },
    { label: "Hungarian", code: "hu" },
    { label: "Thai", code: "th" },
    { label: "Vietnamese", code: "vi" },
    { label: "Indonesian", code: "id" },
    { label: "Malay", code: "ms" },
    { label: "Ukrainian", code: "uk" },
    { label: "Greek", code: "el" },
    { label: "Hebrew", code: "he" },
    { label: "Persian", code: "fa" },
    { label: "Catalan", code: "ca" },
    { label: "Croatian", code: "hr" },
    { label: "Slovak", code: "sk" },
    { label: "Bulgarian", code: "bg" },
];

// Map ISO 639-1 code → display label for detected language badge
const ISO_TO_LABEL: Record<string, string> = Object.fromEntries(
    NATIVE_LANGUAGES.map((l) => [l.code, l.label])
);

// ISO codes whose scripts are latin — transliteration irrelevant
const LATIN_CODES = new Set([
    "en", "es", "fr", "de", "pt", "it", "nl", "pl", "sv", "no", "da",
    "fi", "cs", "ro", "hu", "id", "ms", "ca", "hr", "sk", "bg", "tr", "uk", "vi",
]);

function detectBrowserLanguage(): string {
    if (typeof navigator === "undefined") return "en";
    const raw = navigator.language ?? "en";
    const base = raw.toLowerCase();
    const exact = NATIVE_LANGUAGES.find((l) => l.code.toLowerCase() === base);
    if (exact) return exact.code;
    const prefix = base.split("-")[0];
    const partial = NATIVE_LANGUAGES.find((l) => l.code.toLowerCase() === prefix);
    return partial?.code ?? "en";
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type IngestOptions = {
    translationLanguage: string;
    nativeLanguage: string;
    transliterationEnabled: boolean;
    detectedLanguage: string;
};

type FormPhase = "idle" | "previewing" | "preview_ready" | "confirming";

type Props = {
    onConfirm: (url: string, options: IngestOptions) => void;
    loading: boolean; // true while parent is running full ingest
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function IngestForm({ onConfirm, loading }: Props) {
    // ── URL step ────────────────────────────────────────────────────────────────
    const [url, setUrl] = useState("");
    const [formPhase, setFormPhase] = useState<FormPhase>("idle");
    const [preview, setPreview] = useState<ScenePreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // ── Options ─────────────────────────────────────────────────────────────────
    const [translationLanguage, setTranslationLanguage] = useState("English");
    const [nativeLanguage, setNativeLanguage] = useState("en");
    const [transliterationEnabled, setTransliterationEnabled] = useState(true);
    const [sourceLanguage, setSourceLanguage] = useState<string>("auto");

    // Auto-detect native language from browser
    useEffect(() => {
        setNativeLanguage(detectBrowserLanguage());
    }, []);

    // ── Phase 1: fetch preview ──────────────────────────────────────────────────
    async function handlePreview(e: React.FormEvent) {
        e.preventDefault();
        if (!url.trim()) return;
        setPreviewError(null);
        setFormPhase("previewing");

        try {
            const data = await previewScene(url.trim());
            setPreview(data);
            setSourceLanguage(data.detected_language || "auto");

            // Pre-fill translation language based on detected language:
            const detected = data.detected_language;
            const detectedLabel = ISO_TO_LABEL[detected];
            if (detectedLabel && detectedLabel !== translationLanguage) {
                if (detected === "en") {
                    const nativeLabel = NATIVE_LANGUAGES.find((l) => l.code === nativeLanguage)?.label;
                    if (nativeLabel) setTranslationLanguage(nativeLabel);
                } else {
                    setTranslationLanguage("English");
                }
            }

            setFormPhase("preview_ready");
        } catch (err: any) {
            console.error("[IngestForm] Preview failed:", err);
            setPreviewError(err?.message ?? "Failed to fetch video info. Check the URL and try again.");
            setFormPhase("idle");
        }
    }

    // ── Phase 2: confirm → trigger full ingest ──────────────────────────────────
    function handleConfirm() {
        if (!preview) return;
        onConfirm(url.trim(), {
            translationLanguage,
            nativeLanguage,
            transliterationEnabled,
            detectedLanguage: sourceLanguage // Now using the manually selected source language
        });
        setFormPhase("confirming");
    }

    function handleBack() {
        setFormPhase("idle");
        setPreview(null);
        setPreviewError(null);
    }

    const nativeIsLatin = LATIN_CODES.has(nativeLanguage.split("-")[0]);
    const nativeLabel = NATIVE_LANGUAGES.find((l) => l.code === nativeLanguage)?.label ?? nativeLanguage;
    const isConfirming = formPhase === "confirming" || loading;

    // ── URL input step ──────────────────────────────────────────────────────────
    if (formPhase === "idle" || formPhase === "previewing") {
        return (
            <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                    Step 1 — Video
                </p>

                <div className="flex flex-col gap-2">
                    <input
                        type="url"
                        placeholder="https://youtube.com/watch?v=..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handlePreview(e)}
                        disabled={formPhase === "previewing"}
                        className={[
                            "w-full px-3 py-2 rounded-lg text-sm bg-gray-800 border transition-colors outline-none",
                            "text-gray-100 placeholder-gray-600",
                            formPhase === "previewing"
                                ? "border-gray-700 opacity-50 cursor-not-allowed"
                                : "border-gray-700 focus:border-indigo-500",
                        ].join(" ")}
                    />

                    <button
                        onClick={handlePreview}
                        disabled={formPhase === "previewing" || !url.trim()}
                        className={[
                            "w-full py-2 rounded-lg text-sm font-semibold transition-all",
                            formPhase === "previewing" || !url.trim()
                                ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20",
                        ].join(" ")}
                    >
                        {formPhase === "previewing" ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                Fetching video info…
                            </span>
                        ) : "Continue →"}
                    </button>

                    {previewError && (
                        <p className="text-[11px] text-red-400 leading-relaxed">{previewError}</p>
                    )}
                </div>
            </div>
        );
    }

    // ── Preview + options confirmation step ─────────────────────────────────────
    return (
        <div className="flex flex-col gap-4">

            {/* Back button */}
            <button
                onClick={handleBack}
                disabled={isConfirming}
                className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-400 transition-colors w-fit disabled:opacity-40"
            >
                ← Change URL
            </button>

            {/* Video preview card */}
            {preview && (
                <div className="rounded-lg overflow-hidden border border-gray-800 bg-gray-800/40">
                    {/* Thumbnail */}
                    <div className="relative">
                        <img
                            src={preview.thumbnail_url}
                            alt={preview.title}
                            className="w-full object-cover aspect-video"
                        />
                        {/* Duration badge */}
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono tabular-nums">
                            {formatDuration(preview.duration)}
                        </span>
                        {/* Detected language badge */}
                        <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-indigo-600/90 text-white text-[10px] font-semibold backdrop-blur-sm">
                            {ISO_TO_LABEL[preview.detected_language] ?? preview.detected_language}
                        </span>
                    </div>

                    {/* Title */}
                    <div className="px-3 py-2">
                        <p className="text-xs text-gray-300 font-medium leading-snug line-clamp-2">
                            {preview.title}
                        </p>
                    </div>
                </div>
            )}

            {/* Options */}
            <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Options</p>

                {/* Video language */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Video language</label>
                    <SelectField
                        value={sourceLanguage}
                        onChange={setSourceLanguage}
                        disabled={isConfirming}
                        options={[
                            { label: "Auto-detect (Whisper)", value: "auto" },
                            ...NATIVE_LANGUAGES.map((l) => ({ label: l.label, value: l.code }))
                        ]}
                    />
                </div>

                {/* Translate to */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Translate to</label>
                    <SelectField
                        value={translationLanguage}
                        onChange={setTranslationLanguage}
                        disabled={isConfirming}
                        options={TRANSLATION_LANGUAGES.map((l) => ({ label: l, value: l }))}
                    />
                </div>

                {/* Your language */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">Your language</label>
                    <SelectField
                        value={nativeLanguage}
                        onChange={setNativeLanguage}
                        disabled={isConfirming}
                        options={NATIVE_LANGUAGES.map((l) => ({ label: l.label, value: l.code }))}
                    />
                </div>

                {/* Transliteration toggle */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-gray-300 font-medium">Transliteration</p>
                        <p className="text-[10px] text-gray-600 mt-0.5">
                            {nativeIsLatin
                                ? "Romanization (e.g. Romaji, Pinyin)"
                                : "Phonetics in your native script"}
                        </p>
                    </div>
                    <button
                        onClick={() => setTransliterationEnabled((v) => !v)}
                        disabled={isConfirming}
                        className={[
                            "relative w-9 h-5 rounded-full transition-colors flex-none mt-0.5",
                            transliterationEnabled
                                ? "bg-indigo-600 cursor-pointer"
                                : "bg-gray-700 cursor-pointer",
                        ].join(" ")}
                        role="switch"
                        aria-checked={transliterationEnabled}
                    >
                        <span className={[
                            "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                            transliterationEnabled ? "translate-x-4" : "translate-x-0.5",
                        ].join(" ")} />
                    </button>
                </div>
            </div>

            {/* Confirm button */}
            <button
                onClick={handleConfirm}
                disabled={isConfirming}
                className={[
                    "w-full py-2.5 rounded-lg text-sm font-semibold transition-all",
                    isConfirming
                        ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-500/20",
                ].join(" ")}
            >
                {isConfirming ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Ingesting…
                    </span>
                ) : "Start Ingesting"}
            </button>
        </div>
    );
}

// ─── Styled select ────────────────────────────────────────────────────────────
function SelectField({
    value, onChange, options, disabled,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { label: string; value: string }[];
    disabled?: boolean;
}) {
    return (
        <div className="relative">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={[
                    "w-full appearance-none px-3 py-2 pr-7 rounded-lg text-sm",
                    "bg-gray-800 border border-gray-700 text-gray-200",
                    "focus:outline-none focus:border-indigo-500 transition-colors",
                    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none text-xs">▾</span>
        </div>
    );
}