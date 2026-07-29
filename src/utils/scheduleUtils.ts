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

// 🔄 스케줄 시간 재계산 로직 (빈틈없이 이어지도록)
export const recalculateSchedules = (items: DayScheduleResponse[]): DayScheduleResponse[] => {
    if (!items || items.length === 0) return [];

    // 원본 보호를 위해 복사
    const newItems = items.map(item => ({ ...item }));

    // 1. 첫 번째 일정 처리
    if (!newItems[0].startTime) newItems[0].startTime = "10:00";
    newItems[0].startTime = newItems[0].startTime.substring(0, 5); // HH:mm 포맷 보장
    newItems[0].endTime = calculateEndTime(newItems[0].startTime, newItems[0].duration);

    // 2. 두 번째 일정부터 순차적으로 계산 (Linked List처럼 연결)
    for (let i = 1; i < newItems.length; i++) {
        const prevItem = newItems[i - 1];
        const currentItem = newItems[i];

        // 이전 일정 종료 시간
        const prevEndTime = prevItem.endTime || "00:00";

        // 이동 시간
        const movingDuration = currentItem.movingDuration || 0;

        const arrivalTime = calculateEndTime(prevEndTime, movingDuration);

        // 고정 일정은 저장된 시작시간을 보존하고, 나머지만 앞 일정에 이어 붙인다.
        currentItem.startTime = currentItem.fixedStartTime && currentItem.startTime
            ? currentItem.startTime.substring(0, 5)
            : arrivalTime;

        // 현재 일정 종료 시간 = 시작 + 체류 시간
        currentItem.endTime = calculateEndTime(currentItem.startTime, currentItem.duration);
    }

    return newItems;
};
