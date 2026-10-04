import {fetchWithAuth} from "./utils.ts";

export const makeStaticGoogleMap = async (query: string): Promise<string> => {
    const res = await fetchWithAuth(
        `/api/maps/static?query=${encodeURIComponent(query)}`,
        { method: "GET" }
    );

    if (!res.ok) {
        const fallback = `내보내기용 지도 요청에 실패했습니다. (${res.status})`;
        let message = fallback;
        try {
            const payload = await res.json() as { message?: string };
            if (payload.message) message = payload.message;
        } catch { /* JSON 오류 응답이 아니면 상태 코드 안내를 사용한다. */ }
        throw new Error(message);
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("Static map is empty");

    // blob URL (string)
    return URL.createObjectURL(blob);
};
