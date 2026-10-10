import { Link, useNavigate } from 'react-router-dom';

// Types
import type { SpotResponse } from "../../types/spot";

// Utils
import { getSpotDisplayName, getSpotTypeInfo } from "../../utils/spotUtils";

interface SpotCardProps {
  spot: SpotResponse;
  onDelete?: (id: number) => void;
  onToggleVisit?: (spot: SpotResponse) => void; // ✅ 방문 토글 기능 추가
}

export default function SpotCard({ spot, onDelete, onToggleVisit }: SpotCardProps) {
  const navigate = useNavigate();
  const info = getSpotTypeInfo(spot.spotType);

  // 구글맵 URL 안전 처리
  const safeGoogleMapUrl = (spot.googleMapUrl && spot.googleMapUrl.startsWith('http'))
      ? spot.googleMapUrl
      : `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

  return (
      <div className="yume-card yume-card-interactive group overflow-hidden flex flex-col h-full relative">

        {/* 상단 상태 바 (두께를 얇게 조절) */}
        <div className={`h-1 w-full ${spot.isVisit ? 'bg-green-500' : 'bg-gray-200'}`} />

        <div className="p-5 flex-1 flex flex-col">

          <div className="flex justify-between items-center mb-3.5">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-black border uppercase tracking-tight ${info.color}`}>
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </div>

            {/* 방문 여부 토글 버튼 (기능 연결) */}
            <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisit?.(spot);
                }}
                className={`min-h-11 min-w-11 px-2 py-0.5 rounded-md border text-xs font-black transition-all active:scale-95 ${
                    spot.isVisit
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-500 border-gray-100'
                }`}
            >
              {spot.isVisit ? '방문 완료' : '방문 예정'}
            </button>
          </div>

          <Link className="mb-3 rounded-lg" to={`/spots/${spot.id}`}>
            <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
              {getSpotDisplayName(spot)}
            </h3>
            <div className="flex items-center gap-1">
              <span className="text-gray-300 text-xs">📍</span>
              <p className="text-xs text-gray-500 font-medium line-clamp-1 leading-none">
                {spot.shortAddress || spot.address || "주소 정보 없음"}
              </p>
            </div>
          </Link>

          {/* 설명 영역 */}
          {spot.description ? (
              <p className="text-xs text-gray-500 mb-4 line-clamp-2 leading-relaxed font-medium bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                {spot.description}
              </p>
          ) : (
              <div className="flex-1" />
          )}

          {/* 하단 동작 */}
          <div className="mt-auto pt-4 border-t border-gray-50 flex items-center gap-2">
            <a
                href={safeGoogleMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="yume-button yume-button-primary flex-1"
            >
              🗺️ 지도 보기
            </a>

            <button
                onClick={() => navigate(`/spots/${spot.id}`)}
                className="yume-button yume-button-secondary flex-1"
            >
              상세 정보
            </button>

            {onDelete && (
                <button
                    onClick={() => onDelete(spot.id)}
                    className="yume-icon-button yume-icon-button-danger min-h-11 min-w-11"
                    aria-label={`${getSpotDisplayName(spot)} 삭제`} title="삭제"
                >
                  🗑️
                </button>
            )}
          </div>
        </div>
      </div>
  );
}
