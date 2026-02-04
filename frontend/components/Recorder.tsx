"use client";

import { useRef, useState } from "react";

type Props = {
    onRecorded: (blob: Blob) => void;
};

export default function Recorder({ onRecorded }: Props) {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const [recording, setRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function startRecording() {
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
                const blob = new Blob(chunksRef.current, {
                    type: "audio/webm",
                });
                onRecorded(blob);

                // stop mic tracks
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            mediaRecorderRef.current = mediaRecorder;
            setRecording(true);
        } catch (err) {
            console.error(err);
            setError("Microphone access denied or unavailable.");
        }
    }

    function stopRecording() {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    }

    return (
        <div style={{ marginBottom: 16 }}>
            <hr className="my-4" />
            <p><strong>Recorder</strong></p>

            {!recording ? (
                <button onClick={startRecording} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">Start Recording</button>
            ) : (
                <button onClick={stopRecording} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">Stop Recording</button>
            )}

            {recording && <p>Recording… speak now</p>}

            {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
    );
}
