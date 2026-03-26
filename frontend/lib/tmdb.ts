// ─── TMDB API client ──────────────────────────────────────────────────────────
// Requires NEXT_PUBLIC_TMDB_API_KEY in .env.local
// TMDB docs: https://developer.themoviedb.org/reference/intro/getting-started

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w92";

function apiKey(): string {
    return process.env.NEXT_PUBLIC_TMDB_API_KEY ?? "";
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type TmdbSearchResult = {
    id: number;
    title: string;           // movie title or TV show name
    mediaType: "movie" | "tv";
    year: string;            // release year
    posterUrl: string | null;
    overview: string;
};

export type TmdbCastMember = {
    id: number;
    characterName: string;   // the role they play
    actorName: string;       // the real actor
    profileUrl: string | null;
    order: number;           // billing order — lower = more prominent
};

// ─── Search (multi — returns both movies and TV shows) ────────────────────────
export async function searchTmdb(query: string): Promise<TmdbSearchResult[]> {
    if (!query.trim() || !apiKey()) return [];

    const url = `${TMDB_BASE}/search/multi?api_key=${apiKey()}&query=${encodeURIComponent(query)}&language=en-US&page=1`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);

    const data = await res.json();

    return (data.results ?? [])
        .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
        .slice(0, 8)
        .map((r: any) => ({
            id: r.id,
            title: r.title ?? r.name ?? "Unknown",
            mediaType: r.media_type,
            year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
            posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
            overview: r.overview ?? "",
        }));
}

// ─── Get cast for a movie or TV show ─────────────────────────────────────────
export async function getTmdbCast(
    id: number,
    mediaType: "movie" | "tv"
): Promise<TmdbCastMember[]> {
    if (!apiKey()) return [];

    const endpoint =
        mediaType === "movie"
            ? `${TMDB_BASE}/movie/${id}/credits?api_key=${apiKey()}`
            : `${TMDB_BASE}/tv/${id}/aggregate_credits?api_key=${apiKey()}`;

    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`TMDB credits failed: ${res.status}`);

    const data = await res.json();

    const cast = data.cast ?? [];

    return cast
        .slice(0, 30) // top 30 cast members
        .map((c: any, i: number) => ({
            id: c.id,
            // TV aggregate_credits uses roles[0].character, movie uses character directly
            characterName:
                c.roles?.[0]?.character ?? c.character ?? "Unknown Character",
            actorName: c.name ?? "",
            profileUrl: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : null,
            order: c.order ?? i,
        }))
        .filter((c: TmdbCastMember) => c.characterName && c.characterName !== "Unknown Character");
}