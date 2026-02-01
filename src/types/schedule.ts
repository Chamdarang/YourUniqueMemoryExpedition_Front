// src/types/schedule.ts
import type { SpotType, Transportation } from './enums'; 
// 1. ScheduleCreateRequest.java
export interface ScheduleCreateRequest {
  spotId: number | null;
  scheduleOrder: number;
  startTime: string | null; 
  duration: number;
  movingDuration: number;
  transportation: Transportation;
  memo: string | null;
}

// 2. ScheduleItemRequest.java (Sync용)
export interface ScheduleItemRequest {
  id: number | null;
  scheduleOrder: number;
  spotId: number | null;
  startTime: string | null;
  duration: number;
  endTime: string | null;
  movingDuration: number;
  transportation: Transportation;
  memo: string | null;
}

// 3. ScheduleSyncRequest.java
export interface ScheduleSyncRequest {
  schedules: ScheduleItemRequest[];
}

// 4. ScheduleUpdateMemoRequest.java
export interface ScheduleUpdateMemoRequest {
  memo: string;
}

// 5. ScheduleUpdateRequest.java
export interface ScheduleUpdateRequest {
  spotId: number | null;
  dayId: number;
  scheduleOrder: number;
  startTime: string | null;
  duration: number;
  movingDuration: number;
  transportation: Transportation;
  memo: string | null;
}

export interface DayScheduleResponse {
  id: number;
  dayId: number;
  scheduleOrder: number;
  spotId: number;
  spotName: string;
  spotType: SpotType;
  isVisit: boolean;
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

export interface ScheduleItemRequest {
  id: number | null; // 백엔드에서 Long id
  scheduleOrder: number;
  spotId: number | null;
  startTime: string | null;
  duration: number;
  endTime: string | null; 
  movingDuration: number;
  transportation: Transportation;
  memo: string | null;
  movingMemo: string;
}





// Sync 요청 DTO
export interface ScheduleSyncRequest {
  schedules: ScheduleItemRequest[];
}