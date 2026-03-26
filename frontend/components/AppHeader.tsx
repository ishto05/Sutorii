"use client";

import * as React from "react";
import Link from "next/link";
import { Settings, User, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Design tokens (match reference HTML) ────────────────────────────────────
// primary: #1313ec  →  text-primary / bg-primary  (defined in tailwind.config)
// header bg: white / dark:bg-slate-900
// border: border-slate-200 / dark:border-slate-800

// ─── Logo ─────────────────────────────────────────────────────────────────────
function SutoriiLogo() {
    return (
        <div className="flex items-center gap-2 text-primary">
            {/* Snowflake/asterisk SVG from reference screens */}
            <svg
                className="w-7 h-7"
                fill="currentColor"
                viewBox="0 0 48 48"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    clipRule="evenodd"
                    d="M12.0799 24L4 19.2479L9.95537 8.75216L18.04 13.4961L18.0446 4H29.9554L29.96 13.4961L38.0446 8.75216L44 19.2479L35.92 24L44 28.7521L38.0446 39.2479L29.96 34.5039L29.9554 44H18.0446L18.04 34.5039L9.95537 39.2479L4 28.7521L12.0799 24Z"
                    fillRule="evenodd"
                />
            </svg>
            <span className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                Sutorii
            </span>
        </div>
    );
}

// ─── AppHeader ────────────────────────────────────────────────────────────────
type AppHeaderProps = {
    /** Center slot: HeaderUrlInput | HeaderNav | HeaderBreadcrumb | null */
    centerSlot?: React.ReactNode;
    /** Extra icon buttons on the right (beyond the default settings + profile) */
    extraActions?: React.ReactNode;
    /** Override right side entirely */
    actions?: React.ReactNode;
    className?: string;
};

export function AppHeader({
    centerSlot,
    extraActions,
    actions,
    className,
}: AppHeaderProps) {
    return (
        <header
            className={cn(
                "sticky top-0 z-50 w-full",
                "flex items-center justify-between",
                "border-b border-slate-200 dark:border-slate-800",
                "bg-white/80 dark:bg-slate-900/80 backdrop-blur-md",
                "px-6 lg:px-10 py-3",
                className
            )}
        >
            {/* Left: Logo + optional center slot (when center slot is beside logo) */}
            <div className="flex items-center gap-6 min-w-0">
                <Link href="/" className="flex-none">
                    <SutoriiLogo />
                </Link>
                {centerSlot && (
                    <div className="hidden md:flex min-w-0 flex-1">{centerSlot}</div>
                )}
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 flex-none">
                {actions ?? (
                    <>
                        {extraActions}
                        <HeaderIconButton icon={<Settings className="h-4 w-4" />} label="Settings" />
                        <HeaderIconButton icon={<User className="h-4 w-4" />} label="Profile" />
                    </>
                )}
            </div>
        </header>
    );
}

// ─── HeaderIconButton ─────────────────────────────────────────────────────────
// Shared icon button used across all header variants
type HeaderIconButtonProps = {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    className?: string;
};

export function HeaderIconButton({
    icon,
    label,
    onClick,
    className,
}: HeaderIconButtonProps) {
    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onClick}
            className={cn(
                "h-10 w-10 rounded-lg",
                "bg-slate-100 dark:bg-slate-800",
                "text-slate-600 dark:text-slate-300",
                "hover:bg-slate-200 dark:hover:bg-slate-700",
                "transition-colors",
                className
            )}
        >
            {icon}
        </Button>
    );
}

// ─── Slot: HeaderUrlInput (Screen 1 — New Lesson Setup) ──────────────────────
type HeaderUrlInputProps = {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    disabled?: boolean;
};

export function HeaderUrlInput({
    value,
    onChange,
    onSubmit,
    placeholder = "Paste YouTube URL to start learning...",
    disabled,
}: HeaderUrlInputProps) {
    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") onSubmit?.();
    }

    return (
        <div className="flex w-full min-w-[320px] lg:min-w-[480px] items-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 h-10 overflow-hidden">
            {/* Link icon prefix */}
            <div className="flex items-center justify-center pl-3 text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                </svg>
            </div>
            <Input
                type="url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                    "flex-1 border-none bg-transparent shadow-none",
                    "focus-visible:ring-0 focus-visible:ring-offset-0",
                    "placeholder:text-slate-400 text-sm h-10",
                    "text-slate-900 dark:text-slate-100"
                )}
            />
        </div>
    );
}

// ─── Slot: HeaderNav (Screen 2 — Script Overview) ────────────────────────────
type NavItem = {
    label: string;
    href: string;
    active?: boolean;
};

type HeaderNavProps = {
    items: NavItem[];
};

export function HeaderNav({ items }: HeaderNavProps) {
    return (
        <nav className="flex items-center gap-8">
            {items.map((item) => (
                <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                        "text-sm font-medium transition-colors relative",
                        item.active
                            ? [
                                "text-primary font-bold",
                                // Active underline bar (matches reference)
                                "after:content-[''] after:absolute after:-bottom-[19px]",
                                "after:left-0 after:w-full after:h-0.5 after:bg-primary",
                            ]
                            : "text-slate-500 dark:text-slate-400 hover:text-primary"
                    )}
                >
                    {item.label}
                </Link>
            ))}
        </nav>
    );
}

// ─── Slot: HeaderBreadcrumb (Screen 4 — Speaker Mapping) ─────────────────────
type BreadcrumbItem = {
    label: string;
    href?: string;
};

type HeaderBreadcrumbProps = {
    items: BreadcrumbItem[];
};

export function HeaderBreadcrumb({ items }: HeaderBreadcrumbProps) {
    return (
        <nav className="flex items-center gap-1 text-sm font-medium">
            {items.map((item, i) => {
                const isLast = i === items.length - 1;
                return (
                    <React.Fragment key={item.label}>
                        {i > 0 && (
                            <span className="text-slate-300 dark:text-slate-600 mx-1">/</span>
                        )}
                        {item.href && !isLast ? (
                            <Link
                                href={item.href}
                                className="px-1 py-1 text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
                            >
                                {item.label}
                            </Link>
                        ) : (
                            <span className="px-1 py-1 text-slate-900 dark:text-slate-100 font-semibold">
                                {item.label}
                            </span>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
}

// ─── Preset: Header with Share button (Screen 3 — Pitch Analysis) ────────────
type AppHeaderWithShareProps = Omit<AppHeaderProps, "extraActions">;

export function AppHeaderWithShare(props: AppHeaderWithShareProps) {
    return (
        <AppHeader
            {...props}
            extraActions={
                <HeaderIconButton icon={<Share2 className="h-4 w-4" />} label="Share" />
            }
        />
    );
}