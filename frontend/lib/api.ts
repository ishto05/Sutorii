export async function ingestScene(youtubeUrl: string) {

    console.log(process.env.NEXT_PUBLIC_API_BASE_URL);

    const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/ingest`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ youtube_url: youtubeUrl }),
        }
    );

    return res.json();
}

export async function evaluateLine({
    sceneId,
    lineId,
    expectedText,
    audioBlob,
}: {
    sceneId: string;
    lineId: string;
    expectedText: string;
    audioBlob: Blob;
}) {
    const form = new FormData();
    form.append("sceneId", sceneId);
    form.append("lineId", lineId);
    form.append("expectedText", expectedText);
    form.append("audio", audioBlob);

    const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/evaluate`,
        {
            method: "POST",
            body: form,
        }
    );

    return res.json();
}
