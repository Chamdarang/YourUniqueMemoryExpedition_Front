import { fetchWithAuth } from "./utils";
import type { ApiResponse } from "../types/common";
import type { DayRouteApplyItem, DayRouteAuditResponse, PlanRouteAuditResponse, RouteEstimateRequest, RouteEstimateResponse } from "../types/route";
import type { DayScheduleResponse } from "../types/schedule";

export const estimateRoute = async (
  request: RouteEstimateRequest,
): Promise<RouteEstimateResponse> => {
  const response = await fetchWithAuth("/api/routes/estimate", {
    method: "POST",
    body: JSON.stringify(request),
  });

  const json: ApiResponse<RouteEstimateResponse> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || "경로를 계산하지 못했습니다.");
  }
  return json.data;
};

export const auditDayRoute = async (dayId: number, signal?: AbortSignal): Promise<DayRouteAuditResponse> => {
  const response = await fetchWithAuth(`/api/routes/day/${dayId}/audit`, {
    method: "POST",
    signal,
  });
  const json: ApiResponse<DayRouteAuditResponse> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || "하루 전체 경로를 점검하지 못했습니다.");
  }
  return json.data;
};

export const applyDayRouteEstimates = async (
  dayId: number,
  routes: DayRouteApplyItem[],
): Promise<DayScheduleResponse[]> => {
  const response = await fetchWithAuth(`/api/routes/day/${dayId}/apply`, {
    method: "PATCH",
    body: JSON.stringify({ routes }),
  });
  const json: ApiResponse<DayScheduleResponse[]> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || "예상 이동시간을 일정에 적용하지 못했습니다.");
  }
  return json.data.sort((a, b) => a.scheduleOrder - b.scheduleOrder);
};

export const auditPlanRoutes = async (
  planId: number,
): Promise<PlanRouteAuditResponse> => {
  const response = await fetchWithAuth(`/api/routes/plan/${planId}/audit`, {
    method: "POST",
  });
  const json: ApiResponse<PlanRouteAuditResponse> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || "여행 전체 일정을 점검하지 못했습니다.");
  }
  return json.data;
};
