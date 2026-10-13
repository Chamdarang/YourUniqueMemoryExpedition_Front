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
            <td className="px-6 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${info.color}`}>
                  {info.icon} {info.label}
                </span>
            </td>

            {/* 2. 장소명 및 지도 링크 */}
            <td className="px-6 py-3 max-w-[0px]">
                <div className="flex items-center gap-2 min-w-0">
                    <Link
                        to={`/spots/${spot.id}`}
                        className="block truncate text-sm font-semibold text-gray-900 transition-colors hover:text-blue-600"
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
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                        {spot.description}
                    </p>
                )}
            </td>

            {/* 3. 주소 */}
            <td className="px-6 py-3 max-w-[0px]">
                <div className="text-xs text-gray-500 truncate font-medium" title={spot.address}>
                    {spot.shortAddress || spot.address || '-'}
                </div>
            </td>

            {/* 4. 방문 여부 토글 (디자인 통일) */}
            <td className="px-6 py-3 whitespace-nowrap text-center">
                <button
                    onClick={() => onToggleVisit && onToggleVisit(spot)}
                    className={`yume-button min-h-10 rounded-full px-3 text-xs font-semibold transition-all active:scale-95
            ${spot.isVisit
                        ? 'yume-button-success-outline'
                        : 'yume-button-secondary text-gray-600'
                    }`}
                >
                    {spot.isVisit ? '✅ 방문함' : '⬜ 미방문'}
                </button>
            </td>

            {/* 5. 관리 버튼 (무채색/미니멀 스타일) */}
            <td className="px-6 py-3 whitespace-nowrap text-right">
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={() => navigate(`/spots/${spot.id}`)}
                        className="yume-icon-button yume-icon-button-primary"
                        aria-label={`${getSpotDisplayName(spot)} 상세 정보`} title="상세 정보"
                    >
                        🔍
                    </button>
                    <button
                        onClick={() => onDelete(spot.id)}
                        className="yume-icon-button yume-icon-button-danger"
                        aria-label={`${getSpotDisplayName(spot)} 삭제`} title="삭제"
                    >
                        🗑️
                    </button>
                </div>
            </td>
        </tr>
    );
}
