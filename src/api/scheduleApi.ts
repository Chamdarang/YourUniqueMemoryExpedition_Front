import { fetchWithAuth } from "./utils";
import type { ApiResponse } from "../types/common";
import type { DayScheduleResponse, ScheduleSyncRequest } from "../types/schedule";

// ✅ 수정됨: QueryString(?dayId=) 대신 PathVariable(/day/{id}) 사용
export const getSchedulesByDay = async (dayId: number): Promise<DayScheduleResponse[]> => {
  const res = await fetchWithAuth(`/api/schedules/day/${dayId}`, {
    method: 'GET'
  });

  const json: ApiResponse<DayScheduleResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  
  // scheduleOrder 순서로 정렬해서 반환
  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};

export const syncSchedules = async (dayId: number, req: ScheduleSyncRequest): Promise<DayScheduleResponse[]> => {
  const res = await fetchWithAuth(`/api/schedules/day/${dayId}/sync`, {
    method: 'PUT',
    body: JSON.stringify(req),
  });
  const json: ApiResponse<DayScheduleResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  // 저장 후 최신 ID가 담긴 리스트를 반환받음
  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};

export const deleteSchedule = async (scheduleId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/schedules/${scheduleId}`, {
    method: 'DELETE'
  });

  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};