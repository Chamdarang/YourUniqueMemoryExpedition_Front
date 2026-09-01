import { useState, useCallback } from "react";
import * as scheduleApi from "../api/scheduleApi"; // ✅ API 함수 임포트
import type {
    DayScheduleResponse,
    ScheduleCreateRequest, ScheduleReorderRequest,
    ScheduleUpdateRequest
} from "../types/schedule";
import { useFeedback } from "../components/common/useFeedback";

export const useSchedule = () => {
    const { showToast } = useFeedback();
    const [loading, setLoading] = useState(false);
    const [schedules, setSchedules] = useState<DayScheduleResponse[]>([]);
    const replaceSchedules = useCallback((next: DayScheduleResponse[]) => setSchedules(next), []);

    /** 1. 특정 날짜의 스케줄 목록 조회 */
    const fetchSchedules = useCallback(async (dayId: number) => {
        try {
            setLoading(true);
            const data = await scheduleApi.getSchedulesByDay(dayId); // ✅ API 호출
            setSchedules(data);
            return true;
        } catch (error) {
            console.error("스케줄 로드 실패:", error);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    /** 2. 스케줄 추가 */
    const addSchedule = async (dayId: number, req: ScheduleCreateRequest) => {
        try {
            setLoading(true);
            const data = await scheduleApi.createSchedule(dayId, req); // ✅ API 호출
            setSchedules(data); // 반환된 최신 리스트로 갱신
            return true;
        } catch {
            showToast({ message: "일정을 추가하지 못했습니다.", type: 'error' });
        } finally {
            setLoading(false);
        }
        return false;
    };

    /** 3. 스케줄 정보 수정 */
    const updateSchedule = async (scheduleId: number, req: ScheduleUpdateRequest) => {
        try {
            setLoading(true);
            const data = await scheduleApi.updateSchedule(scheduleId, req); // ✅ API 호출
            setSchedules(data); // 반환된 최신 리스트로 갱신
        } finally {
            setLoading(false);
        }
    };

    /** 4. 스케줄 삭제 */
    const removeSchedule = async (scheduleId: number) => {
        try {
            setLoading(true);
            const data = await scheduleApi.deleteSchedule(scheduleId); // ✅ API 호출
            setSchedules(data); // 반환된 최신 리스트로 갱신
        } finally {
            setLoading(false);
        }
    };

    /** 5. 방문 여부 토글 */
    const toggleVisit = async (scheduleId: number) => {
        try {
            await scheduleApi.toggleScheduleVisit(scheduleId); // ✅ API 호출
            // 서버 응답이 Void이므로 로컬 상태에서 해당 항목만 즉시 반전
            setSchedules(prev => prev.map(s =>
                s.id === scheduleId ? { ...s, isChecked: !s.isChecked } : s
            ));
        } catch (error) {
            console.error("방문 상태 변경 실패:", error);
        }
    };

    /** 6. 스케줄 순서 변경 */
    const reorderSchedule = async (dayId: number, scheduleId: number, req: ScheduleReorderRequest) => {
        try {
            setLoading(true);
            const data = await scheduleApi.reorderSchedule(dayId, scheduleId, req);
            setSchedules(data);
        } catch {
            showToast({ message: "일정 순서를 변경하지 못했습니다.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        schedules,
        fetchSchedules,
        addSchedule,
        updateSchedule,
        removeSchedule,
        toggleVisit,
        reorderSchedule,
        replaceSchedules
    };
};
