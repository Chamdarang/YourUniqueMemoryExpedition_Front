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
    const headers = {
        ...getAuthHeaders(),
        ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    // 2. 만약 백엔드에서 "401 Unauthorized" (토큰 만료/위조) 응답을 주면?
    if (response.status === 401) {
        // 중복 알림 방지 (이미 로그아웃 처리 중이면 무시)
        if (localStorage.getItem('accessToken')) {
            alert("세션이 만료되었습니다. 다시 로그인해주세요. ✈️");
            
            // 토큰 삭제 및 로그인 페이지로 강제 이동
            localStorage.removeItem('accessToken');
            localStorage.removeItem('username');
            localStorage.removeItem('tokenExpiry');
            
            window.location.href = '/login';
        }
        // 에러를 던져서 이후 로직(데이터 처리 등)이 실행되지 않게 막음
        throw new Error("Session expired");
    }

    return response;
};