import { Link, useNavigate } from 'react-router-dom';

// Types
import type { SpotType } from "../../types/enums";
import type { SpotResponse } from "../../types/spot";

interface Props {
    spot: SpotResponse;
    onDelete: (id: number) => void;
    onToggleVisit?: (spot: SpotResponse) => void;
}

// 🎨 스타일 & 아이콘 매핑 헬퍼
const getTypeInfo = (type: SpotType) => {
    switch (type) {
        case 'FOOD': return { icon: '🍚', label: '음식점', color: 'text-red-600 bg-red-50 border-red-100' };
        case 'CAFE': return { icon: '☕', label: '카페', color: 'text-amber-700 bg-amber-50 border-amber-100' };
        case 'LANDMARK': return { icon: '🗼', label: '명소', color: 'text-purple-600 bg-purple-50 border-purple-100' };
        case 'HISTORICAL_SITE': return { icon: '🏯', label: '유적지', color: 'text-stone-600 bg-stone-50 border-stone-100' };
        case 'RELIGIOUS_SITE': return { icon: '🙏', label: '종교시설', color: 'text-orange-600 bg-orange-50 border-orange-100' };
        case 'MUSEUM': return { icon: '🖼', label: '박물관', color: 'text-blue-600 bg-blue-50 border-blue-100' };
        case 'PARK': return { icon: '🌳', label: '공원', color: 'text-green-600 bg-green-50 border-green-100' };
        case 'NATURE': return { icon: '🌲', label: '자연', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
        case 'SHOPPING': return { icon: '🛍️', label: '쇼핑', color: 'text-pink-600 bg-pink-50 border-pink-100' };
        case 'ACTIVITY': return { icon: '🎢', label: '액티비티', color: 'text-yellow-600 bg-yellow-50 border-yellow-100' };
        case 'ACCOMMODATION': return { icon: '🏨', label: '숙소', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' };
        case 'STATION': return { icon: '🚉', label: '교통', color: 'text-gray-600 bg-gray-50 border-gray-100' };
        default: return { icon: '📍', label: '기타', color: 'text-gray-500 bg-gray-50 border-gray-100' };
    }
};

export default function SpotListItem({ spot, onDelete, onToggleVisit }: Props) {
    const navigate = useNavigate();
    const info = getTypeInfo(spot.spotType);

    // ✅ [안전한 링크 생성]
    // 1. http로 시작하는 정상 URL이 있으면 그대로 사용
    // 2. 없거나 비정상적이면 위도/경도를 이용해 구글맵 검색 페이지로 연결
    const safeGoogleMapUrl = (spot.googleMapUrl && spot.googleMapUrl.startsWith('http'))
        ? spot.googleMapUrl
        : `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;
    return (
        <tr className="hover:bg-gray-50 transition group border-b border-gray-100 last:border-none">

            {/* 1. 유형 아이콘 */}
            <td className="px-4 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border ${info.color}`}>
                  {info.icon} {info.label}
                </span>
            </td>

            {/* 2. 장소명 및 설명 */}
            <td className="px-4 py-4 max-w-[0px]">
                <div className="flex items-center gap-2 min-w-0">
                    <Link to={`/spots/${spot.id}`} className="font-bold text-gray-900 hover:text-blue-600 hover:underline truncate block">
                        {spot.spotName}
                    </Link>
                    {/* ✅ 수정된 safeGoogleMapUrl 적용 */}
                    <a
                        href={safeGoogleMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="구글맵에서 보기"
                        className="text-gray-300 hover:text-blue-500 transition shrink-0"
                        onClick={(e) => e.stopPropagation()}
                    >
                        🗺️
                    </a>
                </div>

                {spot.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {spot.description}
                    </p>
                )}
            </td>

            {/* 3. 주소 */}
            <td className="px-4 py-4 max-w-[0px]">
                <div className="text-sm text-gray-500 truncate" title={spot.address}>
                    {spot.shortAddress || spot.address || '-'}
                </div>
            </td>

            {/* 4. 방문 여부 토글 */}
            <td className="px-4 py-4 whitespace-nowrap text-center">
                <button
                    onClick={() => onToggleVisit && onToggleVisit(spot)}
                    className={`inline-flex items-center justify-center gap-1 text-xs font-bold px-2 py-1 rounded-full border transition
            ${spot.isVisit
                        ? 'text-green-600 bg-green-50 border-green-100 hover:bg-green-100 cursor-pointer'
                        : 'text-gray-400 bg-gray-50 border-gray-100 hover:bg-gray-100 hover:text-gray-600 cursor-pointer'
                    }`}
                >
                    {spot.isVisit ? '✅ 방문함' : '⬜ 미방문'}
                </button>
            </td>

            {/* 5. 관리 버튼 */}
            <td className="px-4 py-4 whitespace-nowrap text-right">
                <button
                    onClick={() => navigate(`/spots/${spot.id}`)}
                    className="text-gray-400 hover:text-blue-600 text-sm font-medium mr-3 transition"
                >
                    상세
                </button>
                <button
                    onClick={() => onDelete(spot.id)}
                    className="text-gray-400 hover:text-red-500 text-sm font-medium transition"
                >
                    삭제
                </button>
            </td>
        </tr>
    );
}