import type { SpotType } from './enums';
import type { SpotPurchaseResponse } from './purchase';
import type {SpotVisitHistoryResponse} from "./spotVisitHistory.ts";


export interface SpotResponse {
  id: number;
  placeId: string;
  spotName: string;
  spotType: SpotType;
  address: string;
  shortAddress?: string;  
  website?: string;       
  googleMapUrl?: string;  
  lat: number;
  lng: number;
  isVisit: boolean;
  description?: string;   
  metadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
}

// 2. 장소 생성 요청 (SpotCreateRequest)
export interface SpotCreateRequest {
  placeId?: string;       
  spotName: string;
  spotType: SpotType;
  address: string;
  shortAddress?: string;  
  website?: string;       
  googleMapUrl?: string;  
  lat: number;
  lng: number;
  isVisit: boolean;
  description?: string;   
  metadata: Record<string, unknown>;
  //userMetadata: Record<string, unknown>;
}

// 2. [신규] 상세 조회용 (그룹, 구매 목록 포함)
export interface SpotDetailResponse extends SpotResponse {
  groupName: string[];
  purchases: SpotPurchaseResponse[];
  spotVisitHistory: SpotVisitHistoryResponse[];
}

// 3. [신규] 장소 수정 요청 (SpotUpdateRequest)
export interface SpotUpdateRequest {
  spotName: string;
  spotType: SpotType;
  isVisit: boolean;
  description?: string;
  metadata: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
  
}








