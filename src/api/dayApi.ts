import type { ApiResponse, PageResponse } from "../types/common";
import type { PlanDayDetailResponse, PlanDayIndependentCreateRequest, PlanDayResponse, PlanDaySwapRequest, PlanDayUpdateRequest } from "../types/planday";
import { fetchWithAuth, getAuthHeaders } from "./utils";

// ✅ 검색 및 페이징 조건 파라미터
export interface GetDaysParams {
  page?: number;
  size?: number;
  keyword?: string;
}

// 1. 독립적인 계획 목록 조회 (페이징 + 검색 적용)
// 반환 타입 변경: Promise<PlanDayResponse[]> -> Promise<PageResponse<PlanDayResponse>>
export const getIndependentDays = async (params?: GetDaysParams): Promise<PageResponse<PlanDayResponse>> => {
  const query = new URLSearchParams();

  // 파라미터가 없으면 기본값(0페이지, 9개씩) 사용
  query.append('page', (params?.page || 0).toString());
  query.append('size', (params?.size || 9).toString());

  if (params?.keyword) {
    query.append('keyword', params.keyword);
  }

  const res = await fetchWithAuth(`/api/days/independent?${query.toString()}`, { method: 'GET' });

  // ✅ 응답 타입 변경
  const json: ApiResponse<PageResponse<PlanDayResponse>> = await res.json();

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

// 5. 계획 수정 (이름 변경 등)
export const updatePlanDay = async (dayId: number, req: PlanDayUpdateRequest): Promise<void> => {
  const res = await fetchWithAuth(`/api/days/${dayId}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};

// 6. 순서 변경
export const swapPlanDay = async (req: PlanDaySwapRequest): Promise<void> => {
  const res = await fetchWithAuth('/api/days/swap', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};

// 7. 여행 내 계획 생성
export const createDayInPlan = async (planId: number, dayOrder: number, dayName: string): Promise<PlanDayResponse> => {
  const res = await fetchWithAuth(`/api/days/plan/${planId}`, {
    method: 'POST',
    body: JSON.stringify({ dayName, dayOrder }),
  });
  const json: ApiResponse<PlanDayResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 8. 독립 계획으로 분리
export const detachPlanDay = async (dayId: number): Promise<PlanDayResponse> => {
  const res = await fetchWithAuth(`/api/days/${dayId}/detach`, {
    method: 'POST',
  });
  const json: ApiResponse<PlanDayResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 9. 계획 삭제
export const deleteDay = async (dayId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/days/${dayId}`, {
    method: 'DELETE'
  });

  if (res.status === 204) return;

  const json = await res.json();
  if (!json.success) throw new Error(json.message);
};