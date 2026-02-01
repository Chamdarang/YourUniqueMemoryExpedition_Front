import type { ApiResponse } from "../types/common";
import type { PlanCreateRequest, PlanDetailResponse, PlanResponse, PlanUpdateRequest } from "../types/plan";
import { fetchWithAuth } from "./utils";

export interface GetPlansParams {
    from?: string;    // 'yyyy-MM-dd' 형식
    to?: string;      // 'yyyy-MM-dd' 형식
    months?: number[]; // [1, 2, 12] 등 월 리스트
}

// 2. params를 선택적으로 받을 수 있게 수정
export const getPlans = async (params?: GetPlansParams): Promise<PlanResponse[]> => {
    
    // 쿼리 스트링 생성 로직
    const queryParams = new URLSearchParams();

    if (params) {
        if (params.from) queryParams.append('from', params.from);
        if (params.to) queryParams.append('to', params.to);
        if (params.months && params.months.length > 0) {  
            queryParams.append('months', params.months.join(','));
        }
    }

    // 쿼리 스트링이 있으면 ?를 붙여 URL 완성
    const queryString = queryParams.toString();
    const url = queryString ? `/api/plans?${queryString}` : '/api/plans';

    const res = await fetchWithAuth(url, {
        method: 'GET'
    });

    const json: ApiResponse<PlanResponse[]> = await res.json();
    if(!json.success) throw new Error(json.message);
    return json.data;
}

export const createPlan = async (req: PlanCreateRequest): Promise<PlanResponse> => {
  const res = await fetchWithAuth('/api/plans', {
    method: 'POST',
    body: JSON.stringify(req),
  });

  const json: ApiResponse<PlanResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const getPlanDetail = async (id: number): Promise<PlanDetailResponse> => {
  const res = await fetchWithAuth(`/api/plans/${id}`, {
    method: 'GET',
  });

  const json: ApiResponse<PlanDetailResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const getUpcomingPlan= async () : Promise<PlanResponse | null> =>{
  const res = await fetchWithAuth(`/api/plans/upcoming`, {
    method: 'GET',
  });

  const json: ApiResponse<PlanResponse | null> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export const updatePlan = async (planId: number, data: PlanUpdateRequest): Promise<PlanResponse> => {
  const res = await fetchWithAuth(`/api/plans/${planId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  const json: ApiResponse<PlanResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};