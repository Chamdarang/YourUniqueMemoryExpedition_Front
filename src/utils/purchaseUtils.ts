import type { PurchaseKind, PurchaseStatus } from "../types/enums";

export const PURCHASE_KIND_KEYS: PurchaseKind[] = [
    'SOUVENIR', 'GOSHUIN', 'GOSHUINCHO', 'GACHA', 'FOOD_ITEM', 'STAMP', 'TICKET', 'OTHER'
];
export const PURCHASE_STATUS_KEYS: PurchaseStatus[] = [
    'UNKNOWN', 'WANT', 'AVAILABLE', 'ACQUIRED', 'SKIPPED', 'UNAVAILABLE'
];
//todo: 백엔드에서 enum 목록 가져오기?

export const formatPurchasePrice = (price: number | null, currency?: string | null) =>
    price == null ? '가격 미입력' : `${price.toLocaleString()}${currency ? ` ${currency}` : ''}`;

/**
 * 기념품 종류별 아이콘, 라벨, Tailwind 컬러 스타일을 반환합니다.
 */
export const getPurchaseKindInfo = (kind: PurchaseKind) => {
    switch (kind) {
        case 'GOSHUIN': return { icon: '🧧', label: '고슈인', color: 'text-red-600 bg-red-50 border-red-100' };
        case 'GOSHUINCHO': return { icon: '📒', label: '고슈인첩', color: 'text-orange-600 bg-orange-50 border-orange-100' };
        case 'SOUVENIR': return { icon: '🎁', label: '기념품', color: 'text-pink-600 bg-pink-50 border-pink-100' };
        case 'GACHA': return { icon: '🎰', label: '가챠', color: 'text-purple-600 bg-purple-50 border-purple-100' };
        case 'FOOD_ITEM': return { icon: '🍱', label: '식료품', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
        case 'STAMP': return { icon: '📔', label: '스탬프', color: 'text-blue-600 bg-blue-50 border-blue-100' };
        case 'TICKET': return { icon: '🎟️', label: '티켓', color: 'text-yellow-600 bg-yellow-50 border-yellow-100' };
        default: return { icon: '📦', label: '기타', color: 'text-gray-500 bg-gray-50 border-gray-100' };
    }
};

/**
 * 기념품 구매 상태별 라벨 및 스타일을 반환합니다.
 */
export const getPurchaseStatusInfo = (status: PurchaseStatus) => {
    switch (status) {
        case 'UNKNOWN': return { label: '❓ 모름', color: 'bg-gray-50 text-gray-400 border-gray-100' };
        case 'WANT': return { label: '🥺 사고 싶음', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
        case 'AVAILABLE': return { label: '🏷️ 판매 중', color: 'bg-blue-50 text-blue-700 border-blue-200' };
        case 'ACQUIRED': return { label: '✅ 구매 완료', color: 'bg-green-50 text-green-700 border-green-200' };
        case 'SKIPPED': return { label: '❌ 패스함', color: 'bg-gray-50 text-gray-500 border-gray-200' };
        case 'UNAVAILABLE': return { label: '🚫 품절/없음', color: 'bg-red-50 text-red-600 border-red-200' };
        default: return { label: '❓ 미정', color: 'bg-gray-50 text-gray-400 border-gray-100' };
    }
};
