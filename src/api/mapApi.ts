import {fetchWithAuth} from "./utils.ts";

export const makeStaticGoogleMap = async (query: string): Promise<string> => {
    const res = await fetchWithAuth(
        `/api/maps/static?query=${encodeURIComponent(query)}`,
        { method: "GET" }
    );

    if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Static map fetch failed: ${res.status}`);
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("Static map is empty");

    // blob URL (string)
    return URL.createObjectURL(blob);
};