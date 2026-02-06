// src/types/schedule.ts
import type { SpotType, Transportation } from './enums'; 

// ScheduleItemRequest.java (Sync용)
export interface ScheduleItemRequest {
  id: number | null;
  scheduleOrder: number;
  spotUserId: number | null;
  spotName: string | null;
  lat: number | null;
  lng: number | null;
  spotType: SpotType | null;
  isChecked: boolean;
  startTime: string | null;
  duration: number;
  endTime: string | null;
  movingDuration: number;
  transportation: Transportation;
  memo: string | null;
  movingMemo: string | null;
}

// Sync 요청 DTO
export interface ScheduleSyncRequest {
  schedules: ScheduleItemRequest[];
}

export interface DayScheduleResponse {
  id: number;
  dayId: number;
  scheduleOrder: number;
  spotUserId: number;
  spotName: string;
  spotType: SpotType;
  isChecked: boolean;
  lat: number;
  lng: number;
  startTime: string; // LocalTime -> "HH:mm:ss"
  duration: number;  // 분 단위 예상
  endTime: string;   // LocalTime -> "HH:mm:ss"
  movingDuration: number; // 이동 시간 (분)
  transportation: Transportation;
  memo: string;
  movingMemo: string;
}


