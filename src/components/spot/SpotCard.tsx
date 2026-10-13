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
        <div className="p-3 flex-1 flex flex-col">

          <div className="flex justify-between items-center mb-2">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold border ${info.color}`}>
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </div>

            {/* 방문 여부 토글 버튼 (기능 연결) */}
            <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisit?.(spot);
                }}
                className={`yume-button min-h-10 min-w-11 px-2 text-xs transition-all active:scale-95 ${
                    spot.isVisit
                        ? 'yume-button-success-outline'
                        : 'yume-button-secondary text-gray-600'
                }`}
            >
              {spot.isVisit ? '방문 완료' : '방문 예정'}
            </button>
          </div>

          <Link className="mb-2 rounded-lg" to={`/spots/${spot.id}`}>
            <h3 className="text-base font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
              {getSpotDisplayName(spot)}
            </h3>
            <div className="flex items-center gap-1">
              <span className="text-gray-300 text-xs">📍</span>
              <p className="text-xs text-gray-500 line-clamp-1 leading-tight">
                {spot.shortAddress || spot.address || "주소 정보 없음"}
              </p>
            </div>
          </Link>

          {/* 설명 영역 */}
          {spot.description ? (
              <p className="mt-2 mb-3 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                {spot.description}
              </p>
          ) : (
              <div className="flex-1" />
          )}

          {/* 하단 동작 */}
          <div className="mt-auto pt-3 border-t border-gray-50 flex items-center gap-2">
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
                    className="yume-icon-button yume-icon-button-danger"
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
