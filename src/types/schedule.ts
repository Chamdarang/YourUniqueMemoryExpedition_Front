// src/types/schedule.ts
import type { SpotType, Transportation } from './enums'; 

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
  extraDuration: number;
  extraMovingDuration: number;
  transportation: Transportation;
  memo: string | null;
  movingMemo: string | null;
}

// Sync 요청 DTO
export interface ScheduleSyncRequest {
  schedules: ScheduleItemRequest[];
}

export interface ScheduleCreateRequest {
  scheduleOrder: number; // 추가될 순서
}

export interface ScheduleUpdateRequest {
  spotUserId?: number | null;
  spotName?: string;
  lat?: number;
  lng?: number;
  spotType?: SpotType;
  startTime?: string;      // "HH:mm" 형식
  duration?: number;
  endTime?: string;
  movingDuration?: number;
  extraDuration?: number;
  extraMovingDuration?: number;
  transportation?: Transportation;
  memo?: string;
  movingMemo?: string;
}

export interface ScheduleReorderRequest {
  scheduleOrder: number;
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
  extraDuration: number;
  extraMovingDuration: number;
  transportation: Transportation;
  memo: string;
  movingMemo: string;
}


