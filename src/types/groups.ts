import type { SpotResponse } from "./spot";

// 1. 그룹 조회 응답
export interface SpotGroupResponse {
  id: number;
  groupName: string;
  spotCount: number;
}

export interface SpotGroupDetailResponse extends SpotGroupResponse{
  spots: SpotResponse[];
}

// 2. 그룹 생성 요청
export interface SpotGroupCreateRequest {
  groupName: string;
}

// 3. 그룹 이름 수정 요청
export interface SpotGroupUpdateRequest {
  groupName: string;
}