import { fetchWithAuth } from "./utils";
import type { ApiResponse, Page } from "../types/common";
import type { SpotPurchaseResponse, SpotPurchaseSaveRequest, PurchaseSearchParams } from "../types/purchase";

/**
 * 1. 구매 내역 생성 (POST /api/purchases/spot/{spotId})
 */
export const createPurchase = async (spotId: number, req: SpotPurchaseSaveRequest): Promise<SpotPurchaseResponse> => {
  const res = await fetchWithAuth(`/api/purchases/spot/${spotId}`, {
    method: 'POST',
    body: JSON.stringify({ ...req }),
  });

  const json: ApiResponse<SpotPurchaseResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

/**
 * 2. 구매 내역 수정 (PATCH /api/purchases/{purchaseId})
 */
export const updatePurchase = async (purchaseId: number, req: SpotPurchaseSaveRequest): Promise<SpotPurchaseResponse> => {
  const res = await fetchWithAuth(`/api/purchases/${purchaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });

  const json: ApiResponse<SpotPurchaseResponse> = await res.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
};

/**
 * 3. 구매 내역 삭제 (DELETE /api/purchases/{purchaseId})
 */
export const deletePurchase = async (purchaseId: number): Promise<void> => {
  const res = await fetchWithAuth(`/api/purchases/${purchaseId}`, {
    method: 'DELETE',
  });

  const json: ApiResponse<void> = await res.json();
  if (!json.success) throw new Error(json.message);
};

/**
 * 4. 기념품 통합 검색 및 목록 조회 (GET /api/purchases)
 * @param params PurchaseSearchParams를 포함한 페이징 파라미터
 */
export const getAllPurchases = async (
    params: { page: number; size: number } & PurchaseSearchParams
): Promise<Page<SpotPurchaseResponse>> => {

  const queryObj: Record<string, string> = {
    page: params.page.toString(),
    size: params.size.toString()
  };

  if (params.keyword) queryObj.keyword = params.keyword;
  if (params.kind) queryObj.kind = params.kind;
  if (params.status) queryObj.status = params.status;
  if (params.category) queryObj.category = params.category;

  const query = new URLSearchParams(queryObj).toString();
  const res = await fetchWithAuth(`/api/purchases/search?${query}`, {
    method: 'GET'
  });

  const json: ApiResponse<Page<SpotPurchaseResponse>> = await res.json();

  if (!json.success) throw new Error(json.message);
  return json.data;
};