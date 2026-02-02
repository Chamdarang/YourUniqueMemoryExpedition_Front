export interface ApiResponse<T> {
    success : boolean;
    message : string;
    data : T;
}

export interface PageResponse<T> {
    content: T[];
    totalPages: number;
    totalElements: number;
    size: number;
    number: number; // 현재 페이지 (0부터 시작)
    first: boolean;
    last: boolean;
    empty: boolean;
}