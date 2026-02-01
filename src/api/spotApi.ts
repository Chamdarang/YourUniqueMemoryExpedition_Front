import type { ApiResponse } from "../types/common";
import type { SpotType } from "../types/enums";
import type { SpotCreateRequest, SpotDetailResponse, SpotResponse, SpotUpdateRequest } from "../types/spot";
import { fetchWithAuth } from "./utils";
import type {SpotInUseError, UsedScheduleResponse} from "../types/error.ts";

export const getMySpots = async (): Promise<SpotResponse[]> => {
  const res = await fetchWithAuth('/api/spots', {
    method: 'GET'
  });

  const json: ApiResponse<SpotResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const searchSpots = async (query:string) : Promise<SpotResponse[]> =>{
  const res = await fetchWithAuth(`/api/spots/search/${query}`,{
    method: 'GET',
  });
  const json: ApiResponse<SpotResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}


// 2. 장소 생성 (POST /api/spots)
export const createSpot = async (req: SpotCreateRequest): Promise<SpotResponse> => {
  const res = await fetchWithAuth('/api/spots', {
    method: 'POST',
    body: JSON.stringify(req),
  });

  const json: ApiResponse<SpotResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// ✅ [신규] 장소 상세 조회
export const getSpotDetail = async (id: number): Promise<SpotDetailResponse> => {
  const res = await fetchWithAuth(`/api/spots/${id}`, {
    method: 'GET'
  });

  const json: ApiResponse<SpotDetailResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// ✅ [신규] 장소 정보 수정
export const updateSpot = async (id: number, req: SpotUpdateRequest): Promise<SpotResponse> => {
  const res = await fetchWithAuth(`/api/spots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });

  const json: ApiResponse<SpotResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 3. 장소 삭제 (DELETE /api/spots/{id})
export const deleteSpot = async (id: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/spots/${id}`, {
    method: 'DELETE'
  });

  const json = await res.json();
  if (res.status === 409) {
    const error: SpotInUseError = {
      code: 'SPOT_IN_USE',
      message: json.message,
      data: json.data as UsedScheduleResponse[]
    };
    throw error;
  }
  if (!json.success) {
    throw new Error(json.message);
  }
};

export const getFilteredSpots = async (
  lat?: number, 
  lng?: number, 
  radius?: number,
  isVisit?: boolean,
  spotType?: SpotType // ✅ 신규 파라미터 추가
): Promise<SpotResponse[]> => {
  const params = new URLSearchParams();
  
  if (lat !== undefined) params.append('lat', lat.toString());
  if (lng !== undefined) params.append('lng', lng.toString());
  if (radius !== undefined) params.append('radius', radius.toString());
  if (isVisit !== undefined) params.append('isVisit', isVisit.toString());
  if (spotType !== undefined) params.append('spotType', spotType); // ✅ 쿼리 스트링 추가

  const res = await fetchWithAuth(`/api/spots?${params.toString()}`, {
    method: 'GET'
  });

  const json: ApiResponse<SpotResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};