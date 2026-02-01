// 1. 이동 수단 (Transportation.java)
export type Transportation = 
  | 'WALK' 
  | 'BUS' 
  | 'TRAIN' 
  | 'SHIP' 
  | 'AIRPLANE' 
  | 'TAXI' 
  | 'BICYCLE' 
  | 'MOTORCYCLE';

// 2. 일정 변경 모드 (SwapMode.java)
export type SwapMode = 
  | 'REPLACE'      // 덮어쓰기
  | 'INDEPENDENT'  // 독립시키기
  | 'SWAP'         // 교환하기
  | 'SHIFT';       // 밀어내기

// 3. 장소 유형 (SpotType.java)
export type SpotType = 
  | 'LANDMARK' 
  | 'HISTORICAL_SITE' 
  | 'RELIGIOUS_SITE' 
  | 'PARK' 
  | 'NATURE' 
  | 'MUSEUM' 
  | 'SHOPPING' 
  | 'ACTIVITY' 
  | 'FOOD' 
  | 'CAFE' 
  | 'STATION' 
  | 'ACCOMMODATION' 
  | 'OTHER';

// 4. 구매품 종류 (PurchaseKind.java)
export type PurchaseKind = 
  | 'GOSHUIN' 
  | 'GOSHUINCHO' 
  | 'SOUVENIR' 
  | 'STAMP' 
  | 'TICKET' 
  | 'FOOD_ITEM' 
  | 'OTHER';

// 5. 구매 상태 (PurchaseStatus.java)
export type PurchaseStatus = 
  | 'UNKNOWN' 
  | 'AVAILABLE' 
  | 'WANT' 
  | 'ACQUIRED' 
  | 'SKIPPED' 
  | 'UNAVAILABLE';

// 6. 권한 (Role.java)
export type Role = 'USER' | 'ADMIN';