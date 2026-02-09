import { useNavigate } from 'react-router-dom';

// Types
import type { SpotResponse } from "../../types/spot";

// Utils
import { getSpotTypeInfo } from "../../utils/spotUtils";

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
      /* ✅ 곡률을 rounded-xl로 줄이고 border-2로 구분감 강화 */
      <div className="group bg-white rounded-xl border-2 border-gray-100 overflow-hidden shadow-md hover:shadow-lg hover:border-gray-200 transition-all duration-300 flex flex-col h-full relative">

        {/* 상단 상태 바 (두께를 얇게 조절) */}
        <div className={`h-1 w-full ${spot.isVisit ? 'bg-green-500' : 'bg-gray-200'}`} />

        {/* ✅ 패딩을 p-5로 줄여 크기를 콤팩트하게 조절 */}
        <div className="p-5 flex-1 flex flex-col">

          <div className="flex justify-between items-center mb-3.5">
            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-tight ${info.color}`}>
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </div>

            {/* 방문 여부 토글 버튼 (기능 연결) */}
            <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisit?.(spot);
                }}
                className={`px-2 py-0.5 rounded-md border text-[9px] font-black transition-all active:scale-95 ${
                    spot.isVisit
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-400 border-gray-100'
                }`}
            >
              {spot.isVisit ? '방문 완료' : '방문 예정'}
            </button>
          </div>

          <div className="cursor-pointer mb-3" onClick={() => navigate(`/spots/${spot.id}`)}>
            {/* ✅ 텍스트 크기를 text-lg로 축소 */}
            <h3 className="text-lg font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
              {spot.spotName}
            </h3>
            <div className="flex items-center gap-1">
              <span className="text-gray-300 text-[10px]">📍</span>
              <p className="text-[11px] text-gray-400 font-medium line-clamp-1 leading-none">
                {spot.shortAddress || spot.address || "주소 정보 없음"}
              </p>
            </div>
          </div>

          {/* 설명 영역 (폰트와 여백을 더 작게 조절) */}
          {spot.description ? (
              <p className="text-[11px] text-gray-500 mb-4 line-clamp-2 leading-relaxed font-medium bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                {spot.description}
              </p>
          ) : (
              <div className="flex-1" />
          )}

          {/* 하단 버튼 (정갈한 rounded-lg 적용) */}
          <div className="mt-auto pt-4 border-t border-gray-50 flex items-center gap-2">
            <a
                href={safeGoogleMapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-900 text-white rounded-lg text-[10px] font-black hover:bg-black active:scale-95 transition-all shadow-sm"
            >
              🗺️ 지도 보기
            </a>

            <button
                onClick={() => navigate(`/spots/${spot.id}`)}
                className="flex-1 py-2.5 bg-gray-50 text-gray-500 rounded-lg text-[10px] font-black hover:bg-gray-100 hover:text-gray-900 transition-all border border-gray-100"
            >
              상세 정보
            </button>

            {onDelete && (
                <button
                    onClick={() => onDelete(spot.id)}
                    className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    title="삭제"
                >
                  🗑️
                </button>
            )}
          </div>
        </div>
      </div>
  );
}