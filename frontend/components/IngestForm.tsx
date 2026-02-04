"use client";

import { useState } from "react";

type Props = {
    onSubmit: (youtubeUrl: string) => void;
    loading: boolean;
};

export default function IngestForm({ onSubmit, loading }: Props) {
    const [url, setUrl] = useState("");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!url.trim()) return; // minimal guard
        onSubmit(url.trim());
    }

    return (
        <form onSubmit={handleSubmit} className="mb-4">
            <label className="block mb-2 font-medium">
                YouTube URL
            </label>

            <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="w-full p-2 mb-2 border border-gray-300 rounded"
            />

            <button
                type="submit"
                disabled={loading || !url.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {loading ? "Ingesting…" : "Ingest Scene"}
            </button>
        </form>
    );
}
