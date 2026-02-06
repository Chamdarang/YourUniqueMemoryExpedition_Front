import type { SpotType } from './enums';
import type { SpotPurchaseResponse } from './purchase';
import type {SpotVisitHistoryResponse} from "./spotVisitHistory.ts";


export interface SpotResponse {
  id: number;
  placeId?: string;       // ✅ 신규 필드
  spotName: string;
  spotType: SpotType;
  address: string;
  shortAddress?: string;  // ✅ 신규 필드
  website?: string;       // ✅ 신규 필드
  googleMapUrl?: string;  // ✅ 신규 필드
  lat: number;
  lng: number;
  isVisit: boolean;
  description?: string;   // ✅ 신규 필드
  metadata: Record<string, unknown>;
}

// 2. 장소 생성 요청 (SpotCreateRequest)
export interface SpotCreateRequest {
  placeId?: string;       // ✅ 신규 필드
  spotName: string;
  spotType: SpotType;
  address: string;
  shortAddress?: string;  // ✅ 신규 필드
  website?: string;       // ✅ 신규 필드
  googleMapUrl?: string;  // ✅ 신규 필드
  lat: number;
  lng: number;
  isVisit: boolean;
  description?: string;   // ✅ 신규 필드
  metadata: Record<string, unknown>;
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
  address: string;
  shortAddress?: string;  // ✅ 신규 필드
  website?: string;       // ✅ 신규 필드
  googleMapUrl?: string;  // ✅ 신규 필드
  lat: number;
  lng: number;
  isVisit: boolean;
  description?: string;   // ✅ 신규 필드
  metadata: Record<string, any>;
}








