import type { ApiResponse } from "../types/common";
import type { PlanDayDetailResponse, PlanDayIndependentCreateRequest, PlanDayResponse, PlanDaySwapRequest, PlanDayUpdateRequest } from "../types/planday";
import { fetchWithAuth, getAuthHeaders } from "./utils";

// 1. 독립적인 계획 목록 조회
export const getIndependentDays = async (): Promise<PlanDayResponse[]> => {
  const res = await fetchWithAuth('/api/days/independent', { method: 'GET' });
  const json: ApiResponse<PlanDayResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 2. 독립적인 계획 생성
export const createIndependentDay = async (req: PlanDayIndependentCreateRequest): Promise<PlanDayResponse> => {
  const res = await fetchWithAuth('/api/days/independent', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  const json: ApiResponse<PlanDayResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 3. 계획 상세 조회
export const getPlanDayDetail = async (dayId: number): Promise<PlanDayDetailResponse> => {
  const res = await fetchWithAuth(`/api/days/${dayId}`, { method: 'GET' });
  const json: ApiResponse<PlanDayDetailResponse> = await res.json();
  if (!json.success) throw new Error(json.message); 
  return json.data;
};

// 4. 특정 여행의 계획 목록 조회
export const getPlanDays = async (planId: number): Promise<PlanDayResponse[]> => {
  const res = await fetchWithAuth(`/api/days/plan/${planId}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  const json: ApiResponse<PlanDayResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// ✅ [신규] 계획 수정 (이름 변경)
export const updatePlanDay = async (dayId: number, req: PlanDayUpdateRequest): Promise<void> => {
  const res = await fetchWithAuth(`/api/days/${dayId}`, {
    method: 'PATCH', // 백엔드 구현에 따라 PUT 또는 PATCH
    body: JSON.stringify(req),
  });
  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};

export const swapPlanDay = async (req: PlanDaySwapRequest): Promise<void> => {
  const res = await fetchWithAuth('/api/days/swap', { // 백엔드 엔드포인트 확인 필요
    method: 'POST', // 또는 POST (백엔드 명세에 따름)
    body: JSON.stringify(req),
  });
  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};

export const createDayInPlan = async (planId: number, dayOrder: number, dayName: string): Promise<PlanDayResponse> => {
  const res = await fetchWithAuth(`/api/days/plan/${planId}`, {
    method: 'POST',
    body: JSON.stringify({ dayName, dayOrder }),
  });
  const json: ApiResponse<PlanDayResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const detachPlanDay = async (dayId: number): Promise<PlanDayResponse> => {
  const res = await fetchWithAuth(`/api/days/${dayId}/detach`, {
    method: 'POST',
  });
  const json: ApiResponse<PlanDayResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const deleteDay = async (dayId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/days/${dayId}`, {
    method: 'DELETE'
  });

  // 204 No Content 처리
  if (res.status === 204) return;

  const json = await res.json();
  if (!json.success) throw new Error(json.message);
};