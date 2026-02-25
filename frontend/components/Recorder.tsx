"use client";

import { useRef, useState } from "react";

// ─── Props ────────────────────────────────────────────────────────────────────
type RecorderProps = {
    enabled: boolean;         // page.tsx controls when recording is allowed
    onStart?: () => void;     // optional: notify parent recording began
    onStop: (blob: Blob) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function Recorder({ enabled, onStart, onStop }: RecorderProps) {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const [recording, setRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function startRecording() {
        if (!enabled || recording) return;
        setError(null);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: "audio/webm;codecs=opus",
            });

            chunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: "audio/webm" });
                onStop(blob);
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            mediaRecorderRef.current = mediaRecorder;
            setRecording(true);
            onStart?.();
        } catch (err) {
            console.error(err);
            setError("Microphone access denied or unavailable.");
        }
    }

    function stopRecording() {
        if (!recording) return;
        mediaRecorderRef.current?.stop();
        setRecording(false);
    }

    // ─── Derived UI state ──────────────────────────────────────────────────────
    const isDisabled = !enabled || recording === false && !enabled;
    const canStart = enabled && !recording;
    const canStop = recording;

    return (
        <div className="flex flex-col gap-2">
            {/* Recording indicator */}
            {recording && (
                <div className="flex items-center gap-2 text-sm text-red-500 font-medium">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Recording… speak now
                </div>
            )}

            {/* Disabled state explanation */}
            {!enabled && !recording && (
                <p className="text-xs text-gray-400 italic">
                    Waiting for your line…
                </p>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
                {canStart && (
                    <button
                        onClick={startRecording}
                        className="px-4 py-2 rounded font-medium text-white bg-red-500 hover:bg-red-600 active:bg-red-700 transition-colors shadow-sm"
                    >
                        ● Record
                    </button>
                )}

                {canStop && (
                    <button
                        onClick={stopRecording}
                        className="px-4 py-2 rounded font-medium text-white bg-gray-700 hover:bg-gray-800 active:bg-gray-900 transition-colors shadow-sm"
                    >
                        ■ Stop
                    </button>
                )}

                {!enabled && !recording && (
                    <button
                        disabled
                        className="px-4 py-2 rounded font-medium text-white bg-gray-300 cursor-not-allowed"
                    >
                        ● Record
                    </button>
                )}
            </div>

            {error && (
                <p className="text-xs text-red-500">{error}</p>
            )}
        </div>
    );
}
