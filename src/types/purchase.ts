import type { PurchaseKind, PurchaseStatus } from "./enums";

// 3. 구매 기록 (기존 유지)
export interface SpotPurchaseResponse {
  id: number;
  spotId: number;
  spotName: string;
  kind: PurchaseKind;
  category: string;
  itemName: string;
  status: PurchaseStatus;
  quantity: number;
  price: number;
  currency: string;
  acquiredDate: string;
  note: string;
}

// PurchaseCreateRequest, PurchaseUpdateRequest 대응
export interface SpotPurchaseSaveRequest {
  kind: PurchaseKind;
  category: string;
  itemName: string;
  price: number;
  currency: string;
  status: PurchaseStatus;
  quantity: number;
  acquiredDate: string; // "YYYY-MM-DD"
  note: string;
}

export interface SpotPurchaseResponse {
  id: number;
  spotId: number;
  spotName: string;
  kind: PurchaseKind;
  category: string;
  itemName: string;
  status: PurchaseStatus;
  quantity: number;
  price: number;
  currency: string;
  acquiredDate: string;
  note: string;
}