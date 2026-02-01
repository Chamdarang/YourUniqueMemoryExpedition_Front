import type { SwapMode } from './enums';
import type { DayScheduleResponse } from './schedule';

// 1. 조회 응답 (PlanDayResponse.java)
export interface PlanDayResponse {
  id: number;
  dayName: string;
  dayOrder: number;
}

// 2. 상세 조회 응답 (PlanDayDetailResponse.java)
export interface PlanDayDetailResponse {
  id: number;
  dayName: string;
  dayOrder: number;
  schedules: DayScheduleResponse[];
}

// 3. 독립 계획 생성 요청 (PlanDayIndependentCreateRequest.java)
export interface PlanDayIndependentCreateRequest {
  dayName: string;
}

// 4. 여행 내 계획 생성 요청 (PlanDayCreateRequest.java)
export interface PlanDayCreateRequest {
  dayName: string;
  dayOrder: number;
}

// 5. 계획 수정 요청 (PlanDayUpdateRequest.java)
export interface PlanDayUpdateRequest {
  dayName: string;
}

// 6. 순서 변경 요청 (PlanDaySwapRequest.java)
export interface PlanDaySwapRequest {
  sourceDayId: number;
  targetPlanId: number;
  targetDayOrder: number;
  swapMode: SwapMode;
}