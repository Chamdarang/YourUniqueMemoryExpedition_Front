import type { ScheduleMode } from './planDay';
import type { SpotType, Transportation } from './enums';

export interface PlanShareStatus {
  active: boolean;
  updatedAt: string | null;
  expiresAt: string | null;
  token: string | null;
}

export interface PlanShareLink {
  token: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface PublicPlanShare {
  planName: string;
  planStartDate: string | null;
  planEndDate: string | null;
  planMemo: string | null;
  days: PublicPlanShareDay[];
}

export interface PublicPlanShareDay {
  dayName: string;
  dayOrder: number;
  memo: string | null;
  scheduleMode: ScheduleMode;
  schedules: PublicPlanShareSchedule[];
}

export interface PublicPlanShareSchedule {
  scheduleOrder: number;
  spotName: string | null;
  spotType: SpotType | null;
  lat: number | null;
  lng: number | null;
  startTime: string | null;
  endTime: string | null;
  duration: number;
  movingDuration: number;
  transportation: Transportation | null;
  memo: string | null;
  movingMemo: string | null;
}
