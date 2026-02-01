import { fetchWithAuth } from "./utils";
import type { ApiResponse } from "../types/common";
import type { SpotGroupCreateRequest, SpotGroupDetailResponse, SpotGroupResponse, SpotGroupUpdateRequest } from "../types/groups";

// 1. 모든 그룹 조회
export const getAllGroups = async (): Promise<SpotGroupResponse[]> => {
  const res = await fetchWithAuth('/api/groups', { method: 'GET' });
  const json: ApiResponse<SpotGroupResponse[]> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

export const getGroupById = async (groupId: number): Promise<SpotGroupDetailResponse> => {
  const res = await fetchWithAuth(`/api/groups/${groupId}`, { method: 'GET' });
  const json: ApiResponse<SpotGroupDetailResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 2. 그룹 생성
export const createGroup = async (req: SpotGroupCreateRequest): Promise<SpotGroupResponse> => {
  const res = await fetchWithAuth('/api/groups', {
    method: 'POST',
    body: JSON.stringify(req)
  });
  const json: ApiResponse<SpotGroupResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 3. 그룹 이름 수정
export const updateGroup = async (groupId: number, req: SpotGroupUpdateRequest): Promise<SpotGroupResponse> => {
  const res = await fetchWithAuth(`/api/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify(req)
  });
  const json: ApiResponse<SpotGroupResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 4. 장소를 그룹에 추가 (매핑)
export const addSpotToGroup = async (groupId: number, spotId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/groups/${groupId}/spot/${spotId}`, {
    method: 'POST'
  });
  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};

export const deleteGroup = async (groupId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/groups/${groupId}`,{
    method: 'DELETE'
  });
  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
}


// 5. 장소를 그룹에서 제거 (매핑 해제)
export const removeSpotFromGroup = async (groupId: number, spotId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/groups/${groupId}/spot/${spotId}`, {
    method: 'DELETE'
  });
  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};