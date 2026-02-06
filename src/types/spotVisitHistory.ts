export interface SpotVisitHistoryResponse {
    id: number;
    planId: number;
    planName: string;
    dayId: number;
    dayName: string;
    visitedAt: string; // LocalDate -> "YYYY-MM-DD"
}