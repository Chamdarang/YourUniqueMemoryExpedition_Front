//deleteSpot 중 사용중인 스케쥴이 있을 경우
export interface UsedScheduleResponse {
    scheduleId: number;
    planId: number | null;
    dayId: number;
    planName: string;
    dayName: string;
    scheduleOrder: number;
}
export interface SpotInUseError {
    code: 'SPOT_IN_USE';
    message: string;
    data: UsedScheduleResponse[];
}