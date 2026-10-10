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
            message: `앞 일정 종료 후 이동시간이 ${Math.abs(difference)}분 부족해요. 이 일정 시작 시각이나 이동시간을 조정해 주세요.`,
        };
    }
    if (difference >= 30) {
        return {
            type: 'GAP',
            minutes: difference,
            message: `앞 일정에서 이동하고도 ${difference}분 여유가 있어요.`,
        };
    }
    return null;
};
