"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Search, Loader2, Film, Tv, Users, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchTmdb, getTmdbCast, TmdbSearchResult, TmdbCastMember } from "@/lib/tmdb";

// ─── Types ────────────────────────────────────────────────────────────────────
export type SpeakerStats = {
    speakerId: string;
    segmentCount: number;
    totalDuration: number;
    avgDuration: number;
    /** startTime of each line — used for seek controls */
    segments: number[];
};

type SpeakerMappingPanelProps = {
    speakers: SpeakerStats[];
    mappings: Record<string, string>;
    onSave: (mappings: Record<string, string>) => void;
    /** Locates first line of speaker and seeks to it */
    onPlayPreview: (speakerId: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function SpeakerMappingPanel({
    speakers,
    mappings,
    onSave,
    onPlayPreview,
}: SpeakerMappingPanelProps) {
    // ── TMDB state ───────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<TmdbSearchResult[]>([]);
    const [selectedShow, setSelectedShow] = useState<TmdbSearchResult | null>(null);
    const [castList, setCastList] = useState<TmdbCastMember[]>([]);
    const [loadingCast, setLoadingCast] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // ── Local mapping state (draft until saved) ──────────────────────────────────
    const [draft, setDraft] = useState<Record<string, string>>(mappings);

    const sortedSpeakers = useMemo(() => {
        return [...speakers].sort((a, b) => b.segmentCount - a.segmentCount);
    }, [speakers]);

    // Keep draft in sync if parent mappings change
    useEffect(() => { setDraft(mappings); }, [mappings]);

    // ── Close search dropdown on outside click ───────────────────────────────────
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowSearchDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // ── Debounced TMDB search ────────────────────────────────────────────────────
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function handleSearchInput(value: string) {
        setSearchQuery(value);
        setShowSearchDropdown(true);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!value.trim()) { setSearchResults([]); return; }

        searchTimer.current = setTimeout(async () => {
            setSearching(true);
            try {
                const results = await searchTmdb(value);
                setSearchResults(results);
            } catch (err) {
                console.error("[TMDB] Search error:", err);
            } finally {
                setSearching(false);
            }
        }, 400);
    }

    // ── Select a show → fetch cast ───────────────────────────────────────────────
    async function handleSelectShow(show: TmdbSearchResult) {
        setSelectedShow(show);
        setSearchQuery(show.title);
        setShowSearchDropdown(false);
        setLoadingCast(true);
        try {
            const cast = await getTmdbCast(show.id, show.mediaType);
            setCastList(cast);
        } catch (err) {
            console.error("[TMDB] Cast error:", err);
        } finally {
            setLoadingCast(false);
        }
    }

    // ── Save mappings ────────────────────────────────────────────────────────────
    function handleSave() {
        onSave(draft);
    }

    const hasMappings = Object.values(draft).some((v) => v !== "");

    return (
        <div className="flex flex-col gap-5">

            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Users className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Speaker Mapping
                    </h3>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Map speaker identification tags to actual names for better transcript readability
                </p>
            </div>

            {/* TMDB search */}
            <div ref={searchRef} className="relative">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => handleSearchInput(e.target.value)}
                        onFocus={() => searchResults.length > 0 && setShowSearchDropdown(true)}
                        placeholder="Search drama, movie, series..."
                        className="pl-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                    />
                    {searching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />
                    )}
                </div>

                {/* Search results dropdown */}
                {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
                        {searchResults.map((result) => (
                            <button
                                key={`${result.mediaType}-${result.id}`}
                                onClick={() => handleSelectShow(result)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                            >
                                {/* Poster */}
                                {result.posterUrl ? (
                                    <img
                                        src={result.posterUrl}
                                        alt={result.title}
                                        className="w-8 h-12 object-cover rounded flex-none"
                                    />
                                ) : (
                                    <div className="w-8 h-12 bg-slate-100 dark:bg-slate-700 rounded flex-none flex items-center justify-center">
                                        {result.mediaType === "tv"
                                            ? <Tv className="h-4 w-4 text-slate-400" />
                                            : <Film className="h-4 w-4 text-slate-400" />}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                        {result.title}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {result.mediaType === "tv" ? "TV Series" : "Movie"} · {result.year}
                                    </p>
                                </div>
                                {selectedShow?.id === result.id && (
                                    <Check className="h-4 w-4 text-primary flex-none" />
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Selected show badge */}
            {selectedShow && (
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
                    {selectedShow.mediaType === "tv"
                        ? <Tv className="h-4 w-4 text-primary flex-none" />
                        : <Film className="h-4 w-4 text-primary flex-none" />}
                    <span className="text-sm font-medium text-primary truncate">{selectedShow.title}</span>
                    <span className="text-xs text-primary/60 flex-none">{selectedShow.year}</span>
                    {loadingCast && <Loader2 className="h-3.5 w-3.5 text-primary animate-spin ml-auto flex-none" />}
                    {!loadingCast && castList.length > 0 && (
                        <span className="text-xs text-primary/60 ml-auto flex-none">{castList.length} characters</span>
                    )}
                </div>
            )}

            {/* Speaker cards */}
            <div className="flex flex-col gap-3">
                {sortedSpeakers.map((speaker) => (
                    <SpeakerCard
                        key={speaker.speakerId}
                        speaker={speaker}
                        mappedTo={draft[speaker.speakerId] ?? ""}
                        castList={castList}
                        loadingCast={loadingCast}
                        onPlayPreview={onPlayPreview}
                        onChange={(value) =>
                            setDraft((prev) => ({ ...prev, [speaker.speakerId]: value }))
                        }
                    />
                ))}
            </div>

            {/* Save button */}
            <Button
                onClick={handleSave}
                disabled={!hasMappings}
                className={cn(
                    "w-full font-semibold",
                    hasMappings
                        ? "bg-primary hover:bg-primary/90 text-white shadow-sm shadow-primary/20"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                )}
            >
                Save All Mappings
            </Button>
        </div>
    );
}

// ─── SpeakerCard ──────────────────────────────────────────────────────────────
type SpeakerCardProps = {
    speaker: SpeakerStats;
    mappedTo: string;
    castList: TmdbCastMember[];
    loadingCast: boolean;
    onPlayPreview: (speakerId: string) => void;
    onChange: (value: string) => void;
};

function SpeakerCard({
    speaker,
    mappedTo,
    castList,
    loadingCast,
    onPlayPreview,
    onChange,
}: SpeakerCardProps) {
    const [open, setOpen] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const displayName = mappedTo || "No Mapping";
    const isMapped = !!mappedTo;
    const hasSegments = speaker.segments.length > 0;


    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-white dark:bg-slate-900 flex flex-col gap-3">

            {/* Top row: speaker ID + confidence + controls + dropdown */}
            <div className="flex items-center gap-3 flex-wrap">

                {/* Left: speaker ID + segment indicator */}
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {speaker.speakerId}
                        </p>
                    </div>
                </div>
                {/* Center: playback controls */}
                <div className="flex items-center gap-1 flex-none">
                    <Button variant="secondary" size="sm" onClick={() => onPlayPreview(speaker.speakerId)} disabled={!hasSegments} className="h-8 px-4 gap-1.5 font-semibold text-primary rounded-full shadow-sm bg-primary/10 hover:bg-primary/20">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Preview
                    </Button>
                </div>

                {/* Right: mapping dropdown */}
                <div ref={dropdownRef} className="relative flex-none w-44">
                    <button
                        onClick={() => setOpen((o) => !o)}
                        className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors",
                            isMapped
                                ? "border-primary/40 bg-primary/5 text-primary font-medium"
                                : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500",
                            open && "border-primary ring-1 ring-primary/20"
                        )}
                    >
                        <span className="truncate">{displayName}</span>
                        <ChevronDown className={cn("h-4 w-4 flex-none ml-1 transition-transform", open && "rotate-180")} />
                    </button>

                    {open && (
                        <div className="absolute top-full right-0 mt-1 z-50 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[300px]">
                            {/* Manual Input */}
                            <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                                <Input 
                                    placeholder="Type custom name..." 
                                    value={mappedTo}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => onChange(e.target.value)}
                                    className="h-8 text-xs bg-white dark:bg-slate-950"
                                />
                            </div>
                            <div className="overflow-y-auto overflow-x-hidden">
                                {/* No mapping */}
                                <button
                                    onClick={() => { onChange(""); setOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                                >
                                    <span className="w-4 flex-none">{!mappedTo && <Check className="h-3.5 w-3.5 text-primary" />}</span>
                                    No Mapping
                                </button>

                            {loadingCast ? (
                                <div className="flex items-center justify-center py-4 gap-2 text-xs text-slate-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading cast…
                                </div>
                            ) : castList.length > 0 ? (
                                castList.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => { onChange(c.characterName); setOpen(false); }}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                                    >
                                        <span className="w-4 flex-none">
                                            {mappedTo === c.characterName && <Check className="h-3.5 w-3.5 text-primary" />}
                                        </span>
                                        <span className="truncate">{c.characterName}</span>
                                    </button>
                                ))
                            ) : (
                                <p className="px-3 py-3 text-xs text-slate-400 text-center">
                                    Search a drama or movie above to load characters
                                </p>
                            )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                    <span className="text-slate-400">ⓘ</span>
                    {speaker.segmentCount} segment{speaker.segmentCount !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                    <span className="text-emerald-500">⊙</span>
                    {formatDur(speaker.totalDuration)} total
                </span>
                <span className="flex items-center gap-1">
                    <span className="text-violet-400">♪</span>
                    {formatDur(speaker.avgDuration)} avg
                </span>
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDur(seconds: number): string {
    if (seconds === 0) return "0s";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}