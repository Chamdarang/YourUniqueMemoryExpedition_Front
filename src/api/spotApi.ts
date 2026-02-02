import type { ApiResponse, PageResponse } from "../types/common";
import type { SpotCreateRequest, SpotDetailResponse, SpotResponse, SpotUpdateRequest } from "../types/spot";
import { fetchWithAuth } from "./utils";
import type { SpotInUseError, UsedScheduleResponse } from "../types/error";

// ✅ 통합 파라미터 (리스트 검색 + 지도 검색 모두 커버)
export interface GetSpotsParams {
  page?: number;
  size?: number;
  keyword?: string;
  spotType?: string;
  isVisit?: string;
  // 지도 주변 검색용 파라미터
  lat?: number;
  lng?: number;
  radius?: number;
}

// 1. 통합 목록 조회 (검색, 페이징, 필터, 지도 주변 검색 모두 처리)
export const getMySpots = async (params?: GetSpotsParams): Promise<PageResponse<SpotResponse>> => {
  const query = new URLSearchParams();

  // 페이징 기본값
  query.append('page', (params?.page || 0).toString());
  query.append('size', (params?.size || 10).toString());

  // 필터링
  if (params?.keyword) query.append('keyword', params.keyword);

  if (params?.spotType && params.spotType !== 'ALL') {
    query.append('spotType', params.spotType);
  }

  if (params?.isVisit && params.isVisit !== 'ALL') {
    const boolValue = params.isVisit === 'VISITED' ? 'true' : 'false';
    query.append('isVisit', boolValue);
  }

  // 지도 주변 검색
  if (params?.lat !== undefined) query.append('lat', params.lat.toString());
  if (params?.lng !== undefined) query.append('lng', params.lng.toString());
  if (params?.radius !== undefined) query.append('radius', params.radius.toString());

  const res = await fetchWithAuth(`/api/spots?${query.toString()}`, {
    method: 'GET'
  });

  const json: ApiResponse<PageResponse<SpotResponse>> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 2. 장소 생성
export const createSpot = async (req: SpotCreateRequest): Promise<SpotResponse> => {
  const res = await fetchWithAuth('/api/spots', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  const json: ApiResponse<SpotResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 3. 장소 상세 조회
export const getSpotDetail = async (id: number): Promise<SpotDetailResponse> => {
  const res = await fetchWithAuth(`/api/spots/${id}`, { method: 'GET' });
  const json: ApiResponse<SpotDetailResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 4. 장소 수정
export const updateSpot = async (id: number, req: SpotUpdateRequest): Promise<SpotResponse> => {
  const res = await fetchWithAuth(`/api/spots/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
  const json: ApiResponse<SpotResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 5. 장소 삭제
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