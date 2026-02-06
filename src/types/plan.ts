import type { PlanDayResponse } from "./planDay.ts";

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