export interface GoshuinBook {
  id: number; name: string; memo: string | null; photoId: string | null;
  sourcePurchaseId: number | null; version: number; count: number;
}
export interface GoshuinEntry {
  id: number; spotUserId: number | null; placeName: string; itemName: string | null;
  acquiredDate: string | null; note: string | null; bookId: number | null;
  bookName: string | null; position: number | null; photoId: string | null;
  version: number; quantity: number;
}
export interface GoshuinInput {
  placeName: string; spotUserId: number | null; itemName: string | null;
  acquiredDate: string | null; note: string | null; bookId: number | null;
  position: number | null; version?: number;
}
export interface GoshuinPage {
  content: GoshuinEntry[]; totalElements: number; totalPages: number; number: number;
}
