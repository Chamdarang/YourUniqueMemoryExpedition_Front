import { calculateEndTime, minutesToTime, timeToMinutes } from "./timeUtils";
import type { DayScheduleResponse } from "../types/schedule";

// ✅ [Fix] DayDetailPage에서 사용하는 addTime 함수 추가 (calculateEndTime 래퍼)
export const addTime = (startTime: string, duration: number): string => {
    return calculateEndTime(startTime, duration);
};

// 🔄 편의를 위해 timeUtils의 함수들도 여기서 Re-export
export { minutesToTime, timeToMinutes };

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

        // 현재 일정 시작 시간 = 이전 종료 + 이동 시간
        // (여기서는 빈틈없이 딱 붙여서 계산하는 로직을 기본으로 합니다)
        const arrivalTime = calculateEndTime(prevEndTime, movingDuration);

        // 사용자가 수동으로 시간을 뒤로 미룬 경우(공백 시간)를 지원하려면 아래 로직 사용 가능
        // const manualStartTimeMinutes = timeToMinutes(currentItem.startTime || "00:00");
        // const arrivalTimeMinutes = timeToMinutes(arrivalTime);
        // currentItem.startTime = minutesToTime(Math.max(arrivalTimeMinutes, manualStartTimeMinutes));

        // 현재는 '빈틈없이 연결' 모드 적용
        currentItem.startTime = arrivalTime;

        // 현재 일정 종료 시간 = 시작 + 체류 시간
        currentItem.endTime = calculateEndTime(currentItem.startTime, currentItem.duration);
    }

    return newItems;
};