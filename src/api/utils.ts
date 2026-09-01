import { saveFeedbackFlash } from '../components/common/feedbackBus';

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();

const normalizedApiBaseUrl = configuredApiBaseUrl
    ? `${/^https?:\/\//i.test(configuredApiBaseUrl) ? '' : 'http://'}${configuredApiBaseUrl}`.replace(/\/+$/, '')
    : '';

export const getApiUrl = (url: string): string => {
    if (/^https?:\/\//i.test(url)) return url;
    const normalizedPath = url.startsWith('/') ? url : `/${url}`;
    return `${normalizedApiBaseUrl}${normalizedPath}`;
};

export const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('accessToken');

    if(!token){
        return {}
    }

    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    }
}

export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    // 1. 헤더 병합 (기존 옵션 + 인증 헤더)
    const authHeaders = getAuthHeaders();
    if (options.body instanceof FormData) {
        delete authHeaders['Content-Type'];
    }
    const clientRequestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const headers = {
        ...authHeaders,
        'X-Request-ID': clientRequestId,
        ...(options.headers as Record<string, string>),
    };

    let response: Response;
    try {
        response = await fetch(getApiUrl(url), {
            ...options,
            headers,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        console.error('api_network_error', { requestId: clientRequestId, url, error });
        throw new Error(`서버에 연결하지 못했습니다. 요청 ID: ${clientRequestId}`);
    }

    // 2. 만약 백엔드에서 "401 Unauthorized" (토큰 만료/위조) 응답을 주면?
    if (response.status === 401) {
        // 중복 알림 방지 (이미 로그아웃 처리 중이면 무시)
        if (localStorage.getItem('accessToken')) {
            saveFeedbackFlash({ message: "세션이 만료되었습니다. 다시 로그인해 주세요. ✈️", type: 'info' });
            
            // 토큰 삭제 및 로그인 페이지로 강제 이동
            localStorage.removeItem('accessToken');
            localStorage.removeItem('username');
            localStorage.removeItem('tokenExpiry');
            
            window.location.href = '/login';
        }
        // 에러를 던져서 이후 로직(데이터 처리 등)이 실행되지 않게 막음
        throw new Error("Session expired");
    }

    if (!response.ok) {
        const requestId = response.headers.get('X-Request-ID') || clientRequestId;
        try {
            const payload = await response.clone().json() as { success?: boolean; message?: string };
            if (payload.success === false
                && payload.message
                && !payload.message.includes('요청 ID:')) {
                payload.message = `${payload.message} (요청 ID: ${requestId})`;
                const responseHeaders = new Headers(response.headers);
                responseHeaders.delete('content-length');
                responseHeaders.delete('content-encoding');
                responseHeaders.set('content-type', 'application/json');
                return new Response(JSON.stringify(payload), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: responseHeaders,
                });
            }
        } catch {
            console.error('api_error_response_parse_failed', {
                requestId,
                url,
                status: response.status,
            });
        }
    }

    return response;
};
