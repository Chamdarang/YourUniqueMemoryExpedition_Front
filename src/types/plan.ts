import type { PlanDayResponse } from "./planDay.ts";
import type { SpotType, Transportation } from "./enums";

export interface PlanResponse{
    id: number;
    planName: string;
    planStartDate: string;
    planEndDate: string;
    planDays: number;
    planMemo: string;
}

export interface PlanDetailResponse extends PlanResponse{
    days: PlanDayResponse[];
}

export interface PlanCreateRequest{
    planName: string;
    planStartDate: string;
    planEndDate: string;
    planDays: number;
    planMemo: string;
}

export interface PlanUpdateRequest {
    planName: string;
    planStartDate: string;
    planEndDate: string;
    planDays: number;
    planMemo: string;
}

export interface PlanTransferData {
    formatVersion: number;
    planName: string;
    planStartDate: string | null;
    planEndDate: string | null;
    planDays: number | null;
    planMemo: string | null;
    days: PlanTransferDay[];
}

export interface PlanTransferDay {
    dayName: string;
    dayOrder: number;
    memo: string | null;
    schedules: PlanTransferSchedule[];
}

export interface PlanTransferSchedule {
    scheduleOrder: number;
    spotUserId: number | null;
    spotName: string | null;
    spotType: SpotType | null;
    lat: number | null;
    lng: number | null;
    isChecked: boolean;
    startTime: string;
    fixedStartTime: boolean;
    duration: number;
    endTime: string;
    movingDuration: number;
    extraDuration: number;
    extraMovingDuration: number;
    transportation: Transportation | null;
    memo: string | null;
    movingMemo: string | null;
}
