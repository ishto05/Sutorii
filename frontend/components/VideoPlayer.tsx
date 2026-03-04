"use client";

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import ReactPlayer from "react-player";

export type VideoHandle = {
    seekTo: (seconds: number) => void;
    getCurrentTime: () => number;
};

type VideoPlayerProps = {
    url: string | null;
    playing: boolean;
    onTimeUpdate: (currentTime: number) => void; // renamed: v3 uses onTimeUpdate for time ticks
    onEnded: () => void;
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
    ({ url, playing, onTimeUpdate, onEnded }, ref) => {
        const playerRef = useRef<any>(null);
        const [hasMounted, setHasMounted] = useState(false);
        const [ready, setReady] = useState(false);

        useEffect(() => { setHasMounted(true); }, []);

        // Reset ready overlay whenever the URL changes
        useEffect(() => { setReady(false); }, [url]);

        useImperativeHandle(ref, () => ({
            seekTo: (seconds: number) => playerRef.current?.seekTo(seconds, "seconds"),
            getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
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
                                onTimeUpdate: (e: any) => {
                                    // e is an Event from the underlying media element
                                    // currentTime lives on e.target
                                    const currentTime = (e?.target as HTMLMediaElement)?.currentTime ?? 0;
                                    onTimeUpdate(currentTime);
                                },
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