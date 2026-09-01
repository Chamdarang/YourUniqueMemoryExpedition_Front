import { calculateEndTime, minutesToTime, timeToMinutes } from "./timeUtils";
import type { DayScheduleResponse } from "../types/schedule";

// ✅ [Fix] DayDetailPage에서 사용하는 addTime 함수 추가 (calculateEndTime 래퍼)
export const addTime = (startTime: string, duration: number): string => {
    return calculateEndTime(startTime, duration);
};

// 🔄 편의를 위해 timeUtils의 함수들도 여기서 Re-export
export { minutesToTime, timeToMinutes };

export interface ScheduleTimingWarning {
    type: 'CONFLICT' | 'GAP';
    minutes: number;
    message: string;
}

export const getScheduleTimingWarning = (
    previous: DayScheduleResponse | null,
    current: DayScheduleResponse,
): ScheduleTimingWarning | null => {
    if (!previous?.endTime || !current.startTime) return null;

    const expectedArrival = (
        timeToMinutes(previous.endTime)
        + (current.movingDuration || 0)
    ) % (24 * 60);
    const actualStart = timeToMinutes(current.startTime);
    let difference = actualStart - expectedArrival;
    if (difference <= -12 * 60) difference += 24 * 60;
    if (difference > 12 * 60) difference -= 24 * 60;

    if (difference < 0) {
        return {
            type: 'CONFLICT',
            minutes: Math.abs(difference),
            message: `앞 일정과 이동시간을 고려하면 ${Math.abs(difference)}분 늦습니다.`,
        };
    }
    if (difference >= 30) {
        return {
            type: 'GAP',
            minutes: difference,
            message: `앞 일정 이후 ${difference}분의 빈 시간이 있습니다.`,
        };
    }
    return null;
};
