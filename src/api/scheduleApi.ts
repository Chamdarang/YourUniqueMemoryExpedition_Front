import { fetchWithAuth } from "./utils";
import type { ApiResponse } from "../types/common";
import type {
  DayScheduleResponse,
  ScheduleCreateRequest, ScheduleReorderRequest,
  ScheduleUpdateRequest
} from "../types/schedule";

/** ✅ 1. 특정 날짜의 스케줄 목록 조회 */
export const getSchedulesByDay = async (dayId: number): Promise<DayScheduleResponse[]> => {
  const res = await fetchWithAuth(`/api/schedules/day/${dayId}`, {
    method: 'GET'
  });

  const json: ApiResponse<DayScheduleResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);

  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};

/** ✅ 2. 스케줄 추가 (개별 작업) */
export const createSchedule = async (dayId: number, req: ScheduleCreateRequest): Promise<DayScheduleResponse[]> => {
  const res = await fetchWithAuth(`/api/schedules/day/${dayId}`, {
    method: 'POST',
    body: JSON.stringify(req),
  });

  const json: ApiResponse<DayScheduleResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};

/** ✅ 3. 스케줄 수정 (개별 작업) */
export const updateSchedule = async (scheduleId: number, req: ScheduleUpdateRequest): Promise<DayScheduleResponse[]> => {
  const res = await fetchWithAuth(`/api/schedules/${scheduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });

  const json: ApiResponse<DayScheduleResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};

/** ✅ 4. 스케줄 삭제 (개별 작업) */
export const deleteSchedule = async (scheduleId: number): Promise<DayScheduleResponse[]> => {
  const res = await fetchWithAuth(`/api/schedules/${scheduleId}`, {
    method: 'DELETE'
  });

  const json: ApiResponse<DayScheduleResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};

/** ✅ 5. 방문 여부 토글 */
export const toggleScheduleVisit = async (scheduleId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/schedules/${scheduleId}/visit`, {
    method: 'PATCH'
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.message);
};

/** ✅ 6. 스케줄 순서 변경 (개별 작업) */
export const reorderSchedule = async (dayId: number, scheduleId: number, req: ScheduleReorderRequest): Promise<DayScheduleResponse[]> => {
  const res = await fetchWithAuth(`/api/schedules/day/${dayId}/${scheduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });

  const json: ApiResponse<DayScheduleResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};