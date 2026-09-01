import type {ApiResponse, PageResponse} from "../types/common";
import type { GeneralImportConfig, PlanCreateRequest, PlanDetailResponse, PlanImportAnalysis, PlanImportPreview, PlanResponse, PlanTransferData, PlanUpdateRequest } from "../types/plan";
import { fetchWithAuth } from "./utils";

export interface GetPlansParams {
    page?: number;
    size?: number;
    from?: string;    // 'yyyy-MM-dd' 형식
    to?: string;      // 'yyyy-MM-dd' 형식
    months?: number[]; // [1, 2, 12] 등 월 리스트
    status?: 'ALL' | 'UPCOMING' | 'PAST';
}

// 2. params를 선택적으로 받을 수 있게 수정
export const getPlans = async (params?: GetPlansParams): Promise<PageResponse<PlanResponse>> => {
    
    // 쿼리 스트링 생성 로직
    const queryParams = new URLSearchParams();

    if (params) {
        queryParams.append('page', (params.page || 0).toString());
        queryParams.append('size', (params.size || 10).toString());
        if (params.from) queryParams.append('from', params.from);
        if (params.to) queryParams.append('to', params.to);
        if (params.months && params.months.length > 0) {  
            queryParams.append('months', params.months.join(','));
        }
        if (params.status) queryParams.append('status', params.status);
    }

    // 쿼리 스트링이 있으면 ?를 붙여 URL 완성
    const queryString = queryParams.toString();
    const url = queryString ? `/api/plans?${queryString}` : '/api/plans';

    const res = await fetchWithAuth(url, {
        method: 'GET'
    });

    const json: ApiResponse<PageResponse<PlanResponse>> = await res.json();
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

export const deletePlan = async (id: number): Promise<void> => {
    const res = await fetchWithAuth(`/api/plans/${id}`, {
        method: 'DELETE'
    });

    // 204 No Content면 성공
    if (res.status === 204) return;

    const json = await res.json();
    if (!json.success) throw new Error(json.message);
};

export const exportPlanData = async (id: number): Promise<PlanTransferData> => {
  const res = await fetchWithAuth(`/api/plans/${id}/export`, {
    method: 'GET',
  });
  const json: ApiResponse<PlanTransferData> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const importPlanData = async (data: PlanTransferData): Promise<PlanResponse> => {
  const res = await fetchWithAuth('/api/plans/import', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  const json: ApiResponse<PlanResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const analyzePlanImportFile = async (
  file: File,
  charset = 'AUTO',
  delimiter = 'AUTO',
): Promise<PlanImportAnalysis> => {
  const body = new FormData();
  body.append('file', file);
  const query = new URLSearchParams({ charset, delimiter });
  const res = await fetchWithAuth(`/api/plans/import/file/analyze?${query}`, {
    method: 'POST',
    body,
  });
  const json: ApiResponse<PlanImportAnalysis> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const previewGeneralPlanImport = async (
  file: File,
  config: GeneralImportConfig,
): Promise<PlanImportPreview> => {
  const body = new FormData();
  body.append('file', file);
  body.append('config', new Blob([JSON.stringify(config)], { type: 'application/json' }));
  const res = await fetchWithAuth('/api/plans/import/file/preview', {
    method: 'POST',
    body,
  });
  const json: ApiResponse<PlanImportPreview> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};
