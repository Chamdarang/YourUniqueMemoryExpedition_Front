import { Link, useNavigate } from 'react-router-dom';

// Types
import type { SpotResponse } from "../../types/spot";

// Utils
import { getSpotDisplayName, getSpotTypeInfo } from "../../utils/spotUtils"; // ✅ 공통 유틸리티 임포트

interface Props {
    spot: SpotResponse;
    onDelete: (id: number) => void;
    onToggleVisit?: (spot: SpotResponse) => void;
}

// ❌ 기존의 하드코딩된 getTypeInfo 함수를 삭제했습니다.

export default function SpotListItem({ spot, onDelete, onToggleVisit }: Props) {
    const navigate = useNavigate();

    // ✅ 공통 유틸리티 사용
    const info = getSpotTypeInfo(spot.spotType);

    // ✅ [안전한 링크 생성]
    const safeGoogleMapUrl = (spot.googleMapUrl && spot.googleMapUrl.startsWith('http'))
        ? spot.googleMapUrl
        : `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

    return (
        <tr className="hover:bg-gray-50/50 transition-colors group border-b border-gray-100 last:border-none">

            {/* 1. 유형 아이콘 (유틸리티 스타일 적용) */}
            <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-tight ${info.color}`}>
                  {info.icon} {info.label}
                </span>
            </td>

            {/* 2. 장소명 및 지도 링크 */}
            <td className="px-6 py-4 max-w-[0px]">
                <div className="flex items-center gap-2 min-w-0">
                    <Link
                        to={`/spots/${spot.id}`}
                        className="font-black text-gray-900 hover:text-blue-600 transition-colors truncate block text-sm"
                    >
                        {getSpotDisplayName(spot)}
                    </Link>
                    <a
                        href={safeGoogleMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="구글맵에서 보기"
                        className="text-gray-300 hover:text-blue-500 transition-all shrink-0 text-xs"
                        onClick={(e) => e.stopPropagation()}
                    >
                        🗺️
                    </a>
                </div>

                {spot.description && (
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate italic">
                        {spot.description}
                    </p>
                )}
            </td>

            {/* 3. 주소 */}
            <td className="px-6 py-4 max-w-[0px]">
                <div className="text-xs text-gray-500 truncate font-medium" title={spot.address}>
                    {spot.shortAddress || spot.address || '-'}
                </div>
            </td>

            {/* 4. 방문 여부 토글 (디자인 통일) */}
            <td className="px-6 py-4 whitespace-nowrap text-center">
                <button
                    onClick={() => onToggleVisit && onToggleVisit(spot)}
                    className={`inline-flex items-center justify-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full border transition-all active:scale-95 shadow-sm
            ${spot.isVisit
                        ? 'text-green-600 bg-green-50 border-green-100 hover:bg-green-100'
                        : 'text-gray-400 bg-gray-50 border-gray-100 hover:bg-gray-200 hover:text-gray-600'
                    }`}
                >
                    {spot.isVisit ? '✅ 방문함' : '⬜ 미방문'}
                </button>
            </td>

            {/* 5. 관리 버튼 (무채색/미니멀 스타일) */}
            <td className="px-6 py-4 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => navigate(`/spots/${spot.id}`)}
                        className="text-gray-400 hover:text-gray-900 text-sm font-black transition-colors"
                        title="상세 정보"
                    >
                        🔍
                    </button>
                    <button
                        onClick={() => onDelete(spot.id)}
                        className="text-gray-400 hover:text-red-500 text-sm font-black transition-colors"
                        title="삭제"
                    >
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    );
}
