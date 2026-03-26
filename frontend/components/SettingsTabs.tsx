"use client";

import * as React from "react";
import { Languages, Users, BarChart2, UserSearch, Bot } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
type SelectOption = { label: string; value: string };

type SettingsTabsProps = {
    // ── Tab style ───────────────────────────────────────────────────────────────
    /** "pill" = shadcn default pill tabs (Screen 1)
     *  "underline" = border-bottom active indicator (Screen 5) */
    variant?: "pill" | "underline";

    // ── Language tab ────────────────────────────────────────────────────────────
    /** Show editable selects (Screen 1) vs read-only info cards (Screen 5) */
    readOnly?: boolean;

    // Editable mode (Screen 1)
    translateTo?: string;
    onTranslateToChange?: (value: string) => void;
    translateToOptions?: SelectOption[];

    transliterationEnabled?: boolean;
    onTransliterationChange?: (enabled: boolean) => void;

    // New: Source Language selection
    sourceLanguage?: string;
    onSourceLanguageChange?: (value: string) => void;
    sourceLanguageOptions?: SelectOption[];

    // Read-only mode (Screen 5)
    targetLanguageLabel?: string;   // e.g. "Japanese (JLPT N3)"
    targetLanguageFlag?: string;    // e.g. "🇯🇵"
    voiceStyleLabel?: string;       // e.g. "Natural AI (Sora)"

    // ── Speakers tab ────────────────────────────────────────────────────────────
    /** Inject speaker cards from parent — keeps this component logic-free */
    speakersContent?: React.ReactNode;
    onManualAssign?: () => void;

    // ── Pitch tab ───────────────────────────────────────────────────────────────
    pitchContent?: React.ReactNode;
    pitchEnabled?: boolean;
    onPitchEnabledChange?: (value: boolean) => void;
    pitchSensitivity?: number;
    onPitchSensitivityChange?: (value: number[]) => void;

    // ── Footer (Screen 1 only) ──────────────────────────────────────────────────
    showFooter?: boolean;
    onCancel?: () => void;
    onConfirm?: () => void;

    className?: string;
};

// ─── Component ────────────────────────────────────────────────────────────────
export function SettingsTabs({
    variant = "pill",
    readOnly = false,
    translateTo,
    onTranslateToChange,
    translateToOptions = [],
    transliterationEnabled,
    onTransliterationChange,
    sourceLanguage,
    onSourceLanguageChange,
    sourceLanguageOptions = [],
    targetLanguageLabel,
    targetLanguageFlag,
    voiceStyleLabel,
    speakersContent,
    onManualAssign,
    pitchContent,
    pitchEnabled = false,
    onPitchEnabledChange,
    pitchSensitivity = 50,
    onPitchSensitivityChange,
    showFooter = false,
    onCancel,
    onConfirm,
    className,
}: SettingsTabsProps) {
    return (
        <div className={cn("flex flex-col gap-0 mt-4", className)}>
            <Tabs defaultValue="language">

                {/* ── Tab triggers ─────────────────────────────────────────────────── */}
                {variant === "pill" ? (
                    // Screen 1 — shadcn default pill style
                    <TabsList className="h-10 bg-slate-100 dark:bg-slate-800 justify-start">
                        <TabsTrigger value="language" className="text-sm">
                            Language Settings
                        </TabsTrigger>
                        <TabsTrigger value="speakers" className="text-sm">
                            Speakers
                        </TabsTrigger>
                        <TabsTrigger value="pitch" className="text-sm">
                            Pitch
                        </TabsTrigger>
                    </TabsList>
                ) : (
                    // Screen 5 — underline style
                    <div className="border-b border-slate-200 dark:border-slate-800">
                        <UnderlineTabs />
                    </div>
                )}

                {/* ── Language tab ─────────────────────────────────────────────────── */}
                <TabsContent value="language" className="mt-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Languages className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            Language Settings
                        </h2>
                    </div>

                    {readOnly ? (
                        // Screen 5 — read-only info cards
                        <div className="grid grid-cols-2 gap-4">
                            <InfoCard
                                label="Target Language"
                                icon={
                                    targetLanguageFlag ? (
                                        <span className="text-xl">{targetLanguageFlag}</span>
                                    ) : undefined
                                }
                                value={targetLanguageLabel ?? "—"}
                            />
                            <InfoCard
                                label="Voice Style"
                                icon={<Bot className="h-5 w-5 text-primary" />}
                                value={voiceStyleLabel ?? "—"}
                            />
                        </div>
                    ) : (
                        // Screen 1 — editable selects
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Video language:
                                </Label>
                                <Select
                                    value={sourceLanguage}
                                    onValueChange={onSourceLanguageChange}
                                >
                                    <SelectTrigger className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                                        <SelectValue placeholder="Select video language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sourceLanguageOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Translate to:
                                </Label>
                                <Select
                                    value={translateTo}
                                    onValueChange={onTranslateToChange}
                                >
                                    <SelectTrigger className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                                        <SelectValue placeholder="Select language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {translateToOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Transliteration:
                                </Label>
                                <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md">
                                    <p className="text-sm text-slate-900 dark:text-slate-100">
                                        Enable Phonetics
                                    </p>
                                    <Switch
                                        checked={transliterationEnabled}
                                        onCheckedChange={onTransliterationChange}
                                        className="data-[state=checked]:bg-primary"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>

                {/* ── Speakers tab ─────────────────────────────────────────────────── */}
                <TabsContent value="speakers" className="mt-6">

                    {speakersContent ?? (
                        // Default empty state — shown on Screen 1 before speakers identified
                        <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                            <UserSearch className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                Automated speaker identification is running.
                            </p>
                            <button
                                onClick={onManualAssign}
                                className="mt-4 text-xs font-semibold text-primary hover:underline"
                            >
                                Manually assign speakers
                            </button>
                        </div>
                    )}
                </TabsContent>

                {/* ── Pitch tab ────────────────────────────────────────────────────── */}
                <TabsContent value="pitch" className="mt-6">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart2 className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            Pitch Analysis
                        </h2>
                    </div>

                    <div className="flex flex-col gap-6">
                        {pitchContent}

                        {/* Visual Pitch Tracker toggle */}
                        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                            <div>
                                <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                                    Visual Pitch Tracker
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Show pitch contour over text
                                </p>
                            </div>
                            <Switch
                                checked={pitchEnabled}
                                onCheckedChange={onPitchEnabledChange}
                                className="data-[state=checked]:bg-primary"
                            />
                        </div>
                    </div>
                </TabsContent>

                {/* ── Footer (Screen 1 only) ────────────────────────────────────────── */}
                {showFooter && (
                    <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-6 mt-2">
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="px-6 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={onConfirm}
                            className="px-8 bg-primary hover:bg-primary/90 text-white font-bold shadow-md"
                        >
                            Confirm &amp; Process
                        </Button>
                    </div>
                )}
            </Tabs>
        </div>
    );
}

// ─── UnderlineTabs (Screen 5 style) ──────────────────────────────────────────
// shadcn Tabs doesn't natively support underline variant so we use
// TabsList + TabsTrigger with custom className overrides
function UnderlineTabs() {
    return (
        <TabsList className="h-auto bg-transparent p-0 gap-8 rounded-none justify-start">
            {[
                { value: "language", label: "Language Settings", icon: <Languages className="h-4 w-4" /> },
                { value: "speakers", label: "Speakers", icon: <Users className="h-4 w-4" /> },
                { value: "pitch", label: "Pitch", icon: <BarChart2 className="h-4 w-4" /> },
            ].map((tab) => (
                <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                        "flex items-center gap-2 px-1 py-4 rounded-none border-b-2 border-transparent",
                        "text-sm font-medium text-slate-500 dark:text-slate-400",
                        "hover:text-slate-700 dark:hover:text-slate-200",
                        "data-[state=active]:border-primary data-[state=active]:text-primary",
                        "data-[state=active]:font-bold data-[state=active]:shadow-none",
                        "bg-transparent data-[state=active]:bg-transparent",
                        "-mb-[1px]"   // overlap the parent border-b
                    )}
                >
                    {tab.icon}
                    {tab.label}
                </TabsTrigger>
            ))}
        </TabsList>
    );
}

// ─── InfoCard (Screen 5 read-only language info) ──────────────────────────────
type InfoCardProps = {
    label: string;
    icon?: React.ReactNode;
    value: string;
};

function InfoCard({ label, icon, value }: InfoCardProps) {
    return (
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {label}
            </p>
            <div className="flex items-center gap-3">
                {icon}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                    {value}
                </span>
            </div>
        </div>
    );
}

export default SettingsTabs;