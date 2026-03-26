"use client";

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import ReactPlayer from "react-player";

export type VideoHandle = {
    seekTo: (seconds: number) => void;
    getCurrentTime: () => number;
    captureFrame: (seconds: number) => Promise<string | null>;
};

type VideoPlayerProps = {
    url: string | null;
    playing: boolean;
    onTimeUpdate: (currentTime: number) => void; // renamed: v3 uses onTimeUpdate for time ticks
    onEnded: () => void;
    onPlay?: () => void;
    onPause?: () => void;
};

function cleanYoutubeUrl(url: string | null): string {
    if (!url) return "";
    try {
        const u = new URL(url);
        if (u.hostname === "youtu.be") {
            return `https://www.youtube.com/watch?v=${u.pathname.slice(1)}`;
        }
        if (u.hostname.includes("youtube.com")) {
            const v = u.searchParams.get("v");
            if (v) return `https://www.youtube.com/watch?v=${v}`;
            if (u.pathname.startsWith("/shorts/")) {
                const videoId = u.pathname.split("/")[2];
                if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }
    } catch (e) {
        console.error("[VideoPlayer] URL parse failed:", e);
    }
    return url;
}

const VideoPlayer = forwardRef<VideoHandle, VideoPlayerProps>(
    ({ url, playing, onTimeUpdate, onEnded, onPlay, onPause }, ref) => {
        const playerRef = useRef<any>(null);
        const [hasMounted, setHasMounted] = useState(false);
        const [ready, setReady] = useState(false);

        useEffect(() => { setHasMounted(true); }, []);

        // Reset ready overlay whenever the URL changes
        useEffect(() => { setReady(false); }, [url]);

        useImperativeHandle(ref, () => ({
            seekTo: (seconds: number) => {
                // react-player v3: seekTo may not be on the ref directly.
                // Try the ref method first, fall back to getInternalPlayer.
                try {
                    if (typeof playerRef.current?.seekTo === "function") {
                        playerRef.current.seekTo(seconds, "seconds");
                    } else {
                        // Fall back: get the underlying HTMLVideoElement and set currentTime
                        const internal = playerRef.current?.getInternalPlayer?.();
                        if (internal && typeof internal.currentTime !== "undefined") {
                            internal.currentTime = seconds;
                        }
                    }
                } catch (e) {
                    console.warn("[VideoPlayer] seekTo failed:", e);
                }
            },
            getCurrentTime: () => {
                if (!playerRef.current) return 0;
                try {
                    // Compatible with HTMLMediaElement or backwards compatible method
                    return playerRef.current.currentTime ?? 
                           (typeof playerRef.current.getCurrentTime === "function" 
                             ? playerRef.current.getCurrentTime() 
                             : (playerRef.current.getInternalPlayer?.()?.currentTime ?? 0));
                } catch {
                    return 0;
                }
            },
            captureFrame: (seconds: number): Promise<string | null> => {
                return new Promise((resolve) => {
                    try {
                        // Seek first
                        if (typeof playerRef.current?.seekTo === "function") {
                            playerRef.current.seekTo(seconds, "seconds");
                        } else {
                            const internal = playerRef.current?.getInternalPlayer?.();
                            if (internal?.currentTime !== undefined) internal.currentTime = seconds;
                        }
                        setTimeout(() => {
                            try {
                                const internal = playerRef.current?.getInternalPlayer?.();
                                if (internal && internal instanceof HTMLVideoElement) {
                                    const canvas = document.createElement("canvas");
                                    canvas.width = internal.videoWidth || 640;
                                    canvas.height = internal.videoHeight || 360;
                                    const ctx = canvas.getContext("2d");
                                    if (!ctx) return resolve(null);
                                    ctx.drawImage(internal, 0, 0, canvas.width, canvas.height);
                                    resolve(canvas.toDataURL("image/jpeg", 0.85));
                                } else {
                                    console.warn("[VideoPlayer] captureFrame: cross-origin, cannot capture");
                                    resolve(null);
                                }
                            } catch (err) {
                                console.error("[VideoPlayer] captureFrame error:", err);
                                resolve(null);
                            }
                        }, 350);
                    } catch (e) {
                        resolve(null);
                    }
                });
            },
        }));

        const cleanedUrl = cleanYoutubeUrl(url);

        if (!hasMounted) {
            return (
                <div className="aspect-video w-full bg-slate-900 rounded-lg flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
            );
        }

        return (
            <div className="w-full bg-slate-900 rounded-lg overflow-hidden border border-slate-700 shadow-xl">
                <div className="relative pt-[56.25%] w-full bg-black">
                    <div className="absolute inset-0">

                        {/* pointer-events-none: overlay must never block the iframe */}
                        {!ready && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 pointer-events-none">
                                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
                                <span className="text-white/40 text-xs tracking-widest">LOADING VIDEO…</span>
                            </div>
                        )}

                        <ReactPlayer
                            key={cleanedUrl}
                            ref={playerRef}
                            {...({
                                src: cleanedUrl,
                                playing: playing,
                                controls: true,
                                width: "100%",
                                height: "100%",
                                style: { position: "absolute", top: 0, left: 0 },
                                onReady: () => {
                                    console.log("[VideoPlayer] onReady ✓");
                                    setReady(true);
                                },
                                // ✅ v3: onTimeUpdate fires on every time tick (like HTMLMediaElement)
                                //    onProgress fires on data load events — NOT what we want for sync
                                onTimeUpdate: () => {
                                    // v3: onTimeUpdate receives no args. Must get time from ref.
                                    if (playerRef.current) {
                                        try {
                                            // Since v3, instance methods aim to be compatible with HTMLMediaElement
                                            // So try .currentTime first, then .getCurrentTime() for backwards compatibility
                                            const currentTime = playerRef.current.currentTime ?? 
                                                              (typeof playerRef.current.getCurrentTime === "function" 
                                                                ? playerRef.current.getCurrentTime() 
                                                                : (playerRef.current.getInternalPlayer?.()?.currentTime ?? 0));
                                            onTimeUpdate(currentTime);
                                        } catch (e) {
                                            console.warn("[VideoPlayer] Failed to get currentTime in onTimeUpdate:", e);
                                        }
                                    }
                                },
                                onPlay: onPlay,
                                onPause: onPause,
                                onEnded: onEnded,
                                onError: (e: any) => console.error("[VideoPlayer] error:", e),
                            } as any)}
                        />
                    </div>
                </div>
            </div>
        );
    }
);

VideoPlayer.displayName = "VideoPlayer";

export default VideoPlayer;