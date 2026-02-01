import { fetchWithAuth } from "./utils";
import type { ApiResponse } from "../types/common"; // ✅ ApiResponse import 추가
import type { SpotPurchaseResponse, SpotPurchaseSaveRequest } from "../types/purchase";

// 1. 구매 내역 생성 (POST /api/purchases)
// 백엔드 PurchaseCreateRequest에는 spotId가 필요하므로 합쳐서 보냄
export const createPurchase = async (spotId: number, req: SpotPurchaseSaveRequest): Promise<SpotPurchaseResponse> => {
  const res = await fetchWithAuth(`/api/purchases`, {
    method: 'POST',
    body: JSON.stringify({ ...req, spotId }), 
  });

  // ✅ ApiResponse 타입 명시
  const json: ApiResponse<SpotPurchaseResponse> = await res.json();
  
  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 2. 구매 내역 수정 (PATCH /api/purchases/{purchaseId})
export const updatePurchase = async (purchaseId: number, req: SpotPurchaseSaveRequest): Promise<SpotPurchaseResponse> => {
  const res = await fetchWithAuth(`/api/purchases/${purchaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });

  // ✅ ApiResponse 타입 명시
  const json: ApiResponse<SpotPurchaseResponse> = await res.json();

  if (!json.success) throw new Error(json.message);
  return json.data;
};

// 3. 구매 내역 삭제 (DELETE /api/purchases/{purchaseId})
export const deletePurchase = async (purchaseId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/purchases/${purchaseId}`, {
    method: 'DELETE',
  });

  // ✅ ApiResponse 타입 명시 (데이터가 없으므로 void)
  const json: ApiResponse<void> = await res.json();

  if (!json.success) throw new Error(json.message);
};