"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { previewScene, confirmIngest, ScenePreview } from "@/lib/api";
import { useSutoriiStore } from "@/store/sutorii";

import { AppHeader, HeaderUrlInput } from "@/components/AppHeader";
import { VideoCard } from "@/components/VideoCard";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { SettingsTabs } from "@/components/SettingsTabs";
import CharacterSelect from "@/components/CharacterSelect";
import { SpeakerMappingPanel, SpeakerStats } from "@/components/SpeakerMappingPanel";
import VideoPlayer, { VideoHandle } from "@/components/VideoPlayer";

import { Button } from "@/components/ui/button";
import { Zap, ArrowLeft } from "lucide-react";

// ─── Language data ────────────────────────────────────────────────────────────
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

const TRANSLATION_OPTIONS = NATIVE_LANGUAGES.map((l) => ({
    label: l.label,
    value: l.label,
}));

const ISO_TO_LABEL: Record<string, string> = Object.fromEntries(
    NATIVE_LANGUAGES.map((l) => [l.code, l.label])
);

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
    return NATIVE_LANGUAGES.find((l) => l.code.toLowerCase() === prefix)?.code ?? "en";
}

// ─── Phase machine ────────────────────────────────────────────────────────────
type SetupPhase =
    | "idle"             // no URL fetched yet
    | "previewing"       // previewScene() in flight
    | "preview_ready"    // thumbnail/title/duration loaded, options visible
    | "ingesting"        // confirmIngest() in flight
    | "speaker_mapping"  // UI flow 1: assign speakers
    | "character_select"; // UI flow 2: pick character

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SetupPage() {
    const router = useRouter();

    const { scenePackage, setScenePackage, setSelectedCharacter, setAppPhase, setLanguageSettings, resetAll, speakerMappings, setSpeakerMappings } =
        useSutoriiStore();

    const [setupPhase, setSetupPhase] = useState<SetupPhase>(
        scenePackage ? "speaker_mapping" : "idle"
    );
    const [headerUrl, setHeaderUrl] = useState("");
    const [preview, setPreview] = useState<ScenePreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);

    // Language options
    const [translateTo, setTranslateTo] = useState("English");
    const [nativeLanguage, setNativeLanguage] = useState("en");
    const [transliterationEnabled, setTransliterationEnabled] = useState(false);
    const [pitchEnabled, setPitchEnabled] = useState(false);
    const [pitchSensitivity, setPitchSensitivity] = useState(50);

    const playerRef = useRef<VideoHandle>(null);

    // Compute speaker segments for mapping
    const speakerStats = useMemo<SpeakerStats[]>(() => {
        if (!scenePackage) return [];
        const map: Record<string, { count: number; total: number; segments: number[] }> = {};
        scenePackage.script.forEach((line) => {
            const dur = (line.endTime ?? 0) - (line.startTime ?? 0);
            if (!map[line.characterName]) map[line.characterName] = { count: 0, total: 0, segments: [] };
            map[line.characterName].count += 1;
            map[line.characterName].total += dur;
            map[line.characterName].segments.push(line.startTime ?? 0);
        });
        return Object.entries(map).map(([id, s]) => ({
            speakerId: id,
            segmentCount: s.count,
            totalDuration: Math.round(s.total),
            avgDuration: s.count > 0 ? Math.round(s.total / s.count) : 0,
            segments: s.segments,
        }));
    }, [scenePackage]);

    // Auto-detect browser language on mount
    useEffect(() => { setNativeLanguage(detectBrowserLanguage()); }, []);

    // ── Phase 1: fetch preview ────────────────────────────────────────────────────
    async function handlePreview() {
        if (!headerUrl.trim()) return;
        setPreviewError(null);
        setSetupPhase("previewing");

        try {
            const data = await previewScene(headerUrl.trim());
            setPreview(data);

            // Auto-fill translation language from detected video language
            if (data.detected_language === "en") {
                const nativeLabel = NATIVE_LANGUAGES.find((l) => l.code === nativeLanguage)?.label;
                if (nativeLabel) setTranslateTo(nativeLabel);
            } else {
                setTranslateTo("English");
            }

            setSetupPhase("preview_ready");
        } catch (err: any) {
            console.error("[Setup] Preview failed:", err);
            setPreviewError(err?.message ?? "Failed to fetch video info. Check the URL and try again.");
            setSetupPhase("idle");
        }
    }

    // ── Phase 2: full ingest ──────────────────────────────────────────────────────
    async function handleConfirmIngest() {
        if (!headerUrl.trim()) return;
        const langSettings = {
            videoTitle: preview?.title ?? "",
            translationLanguage: translateTo,
            nativeLanguage,
            transliterationEnabled: transliterationEnabled,
        };

        // resetAll clears store, then we re-apply language settings
        resetAll();
        setLanguageSettings(langSettings);
        setSetupPhase("ingesting");

        const payload = {
            translation_language: translateTo,
            native_language: nativeLanguage,
            transliteration_enabled: transliterationEnabled,
        };
        console.log("[Setup] Submitting to ingest payload:", payload);

        const scene = await confirmIngest(headerUrl.trim(), payload);

        if (!scene || !Array.isArray(scene.script)) {
            console.error("[Setup] Invalid ScenePackage:", scene);
            setSetupPhase("preview_ready");
            return;
        }

        setScenePackage(scene);

        // scene.source.title is the real YouTube title from the backend —
        // override whatever preview title we had (or the empty string fallback)
        if (scene.source?.title) {
            setLanguageSettings({
                videoTitle: scene.source.title,
                translationLanguage: translateTo,
                nativeLanguage,
                transliterationEnabled: transliterationEnabled,
            });
        }

        setSetupPhase("speaker_mapping");
    }

    // ── Character selected → /play ────────────────────────────────────────────────
    const handleCharacterSelect = useCallback((character: string) => {
        setSelectedCharacter(character);
        setAppPhase("ready");
        router.push("/play");
    }, [setSelectedCharacter, setAppPhase, router]);

    // ── Reset ─────────────────────────────────────────────────────────────────────
    function handleReset() {
        resetAll();
        setSetupPhase("idle");
        setPreview(null);
        setHeaderUrl("");
        setPreviewError(null);
    }

    // ── Derived ───────────────────────────────────────────────────────────────────
    const isPreviewing = setupPhase === "previewing";
    const isIngesting = setupPhase === "ingesting";
    const hasPreview = ["preview_ready", "ingesting", "speaker_mapping", "character_select"].includes(setupPhase);
    const showFooter = hasPreview && setupPhase !== "character_select" && setupPhase !== "speaker_mapping";

    // VideoCard display values
    const thumbUrl = preview?.thumbnail_url ?? undefined;
    const videoTitle = preview?.title ?? "Paste a YouTube URL to begin";
    const videoDuration = preview?.duration ? formatTime(preview.duration) : undefined;
    const detectedLang = preview?.detected_language
        ? (ISO_TO_LABEL[preview.detected_language] ?? preview.detected_language)
        : undefined;

    // ─── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#f6f6f8] dark:bg-[#101022] flex flex-col font-sans">

            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <AppHeader
                centerSlot={
                    <HeaderUrlInput
                        value={headerUrl}
                        onChange={setHeaderUrl}
                        onSubmit={handlePreview}
                        disabled={isPreviewing || isIngesting}
                        placeholder="Paste YouTube URL to start learning..."
                    />
                }
                extraActions={
                    // Only show header Ingest button before preview is loaded
                    !hasPreview ? (
                        <Button
                            onClick={handlePreview}
                            disabled={isPreviewing || !headerUrl.trim()}
                            className="bg-primary hover:bg-primary/90 text-white font-semibold px-5 h-10 shadow-sm shadow-primary/20"
                        >
                            {isPreviewing ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Fetching…
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Zap className="h-4 w-4" />
                                    Ingest
                                </span>
                            )}
                        </Button>
                    ) : undefined
                }
            />

            {/* ── Main ───────────────────────────────────────────────────────────── */}
            <main className="flex-1 mx-auto w-full px-4 lg:px-10 py-8">

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* ── Left col ─────────────────────────────────────────────────── */}
                    <div className="lg:col-span-2 flex flex-col gap-6">

                        {/* ── VideoCard — single source of truth for video display ────── */}
                        <VideoCard
                            playing={playing}
                            onPlayToggle={() => setPlaying((p) => !p)}
                            thumbnailUrl={thumbUrl}
                            title={videoTitle}
                            duration={videoDuration}
                            quality={videoDuration ? "High Quality" : undefined}
                            overlayBadge={hasPreview ? "Video Preview Available" : undefined}
                            detectedLanguage={detectedLang}
                            loading={isPreviewing}
                            error={previewError ?? undefined}
                            onStartPlaying={hasPreview ? handleConfirmIngest : undefined}
                        >
                            {/* SettingsTabs / CharacterSelect rendered in VideoCard children slot */}
                            {setupPhase === "character_select" && scenePackage ? (
                                <>
                                    <button
                                        onClick={handleReset}
                                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
                                    >
                                        <ArrowLeft className="h-3 w-3" />
                                        Change URL
                                    </button>
                                    <CharacterSelect
                                        uniqueCharacters={scenePackage.uniqueCharacters}
                                        script={scenePackage.script}
                                        onSelect={handleCharacterSelect}
                                    />
                                </>
                            ) : setupPhase === "speaker_mapping" && scenePackage ? (
                                <>
                                    <button
                                        onClick={handleReset}
                                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
                                    >
                                        <ArrowLeft className="h-3 w-3" />
                                        Change URL
                                    </button>
                                    <SpeakerMappingPanel
                                        speakers={speakerStats}
                                        mappings={speakerMappings}
                                        onSave={(mappings) => {
                                            setSpeakerMappings(mappings);
                                            setSetupPhase("character_select");
                                        }}
                                        onPlayPreview={(speakerId) => {
                                            if (playerRef.current) {
                                                const targetSpeaker = speakerStats.find((s: SpeakerStats) => s.speakerId === speakerId);
                                                if (targetSpeaker && targetSpeaker.segments.length > 0) {
                                                    setPlaying(true);
                                                    playerRef.current.seekTo(targetSpeaker.segments[0]);
                                                }
                                            }
                                        }}
                                    />
                                    {/* Hidden video player exclusively required for precise Speaker Mapping audio previews */}
                                    <div className="hidden">
                                        <VideoPlayer
                                            ref={playerRef}
                                            url={scenePackage.source.url || scenePackage.source.youtube_url || headerUrl}
                                            playing={playing}
                                            onTimeUpdate={() => { }}
                                            onPlay={() => setPlaying(true)}
                                            onPause={() => setPlaying(false)}
                                            onEnded={() => setPlaying(false)}
                                        />
                                    </div>
                                </>
                            ) : (
                                <SettingsTabs
                                    variant="pill"
                                    translateTo={translateTo}
                                    onTranslateToChange={setTranslateTo}
                                    translateToOptions={TRANSLATION_OPTIONS}
                                    transliterationEnabled={transliterationEnabled}
                                    onTransliterationChange={setTransliterationEnabled}
                                    pitchEnabled={pitchEnabled}
                                    onPitchEnabledChange={setPitchEnabled}
                                    pitchSensitivity={pitchSensitivity}
                                    onPitchSensitivityChange={([v]) => setPitchSensitivity(v)}
                                    showFooter={showFooter}
                                    onCancel={handleReset}
                                    onConfirm={handleConfirmIngest}
                                />
                            )}
                        </VideoCard>

                    </div>

                    {/* ── Right col: transcript panel ───────────────────────────────── */}
                    <div className="lg:col-span-1 lg:sticky lg:top-20">
                        <TranscriptPanel
                            status="empty"
                            headerVariant="draft"
                            footerVariant="info"
                            className="min-h-[500px]"
                        />
                    </div>

                </div>
            </main>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}