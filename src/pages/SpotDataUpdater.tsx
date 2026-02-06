import { useState, useEffect } from "react";
import { useMapsLibrary, APIProvider } from "@vis.gl/react-google-maps";
import {getMySpots, spotDataUpdate} from "../api/spotApi.ts";
import type {SpotUpdateRequest} from "../types/spot.ts";
import {mapGoogleTypeToSpotType} from "../utils/mapUtils.ts";

// API 및 유틸

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function SpotDataUpdaterPage() {
    return (
        // 독립 페이지로 작동하기 위해 내부에서 APIProvider를 포함합니다.
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places']}>
            <div className="min-h-screen bg-gray-50 py-12 px-4">
                <SpotDataUpdaterContent />
            </div>
        </APIProvider>
    );
}

function SpotDataUpdaterContent() {
    const [isUpdating, setIsUpdating] = useState(false);
    const [status, setStatus] = useState({ current: 0, total: 0, lastSpot: "" });
    const [logs, setLogs] = useState<string[]>([]);

    const placesLibrary = useMapsLibrary("places");

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
    };

    // 라이브러리 로드 감시
    useEffect(() => {
        if (placesLibrary) {
            addLog("📡 Google Places 라이브러리 로드 완료. 이제 작업을 시작할 수 있습니다.");
        }
    }, [placesLibrary]);

    const handleUpdateAllSpots = async () => {
        if (!placesLibrary) return;

        if (!window.confirm("DB의 모든 장소 정보를 구글 최신 데이터(사진, 영업시간 등)로 갱신하시겠습니까?")) return;

        try {
            setIsUpdating(true);
            addLog("🚀 전체 장소 목록을 가져오는 중...");

            // 1. 전체 데이터 조회 (최대 2000개)
            const allData = await getMySpots({ page: 0, size: 2000 });
            const targets = allData.content.filter(s => !!s.placeId);

            setStatus({ current: 0, total: targets.length, lastSpot: "" });
            addLog(`✅ 총 ${targets.length}개의 업데이트 대상 확인.`);

            for (let i = 0; i < targets.length; i++) {
                const spot = targets[i];
                setStatus(prev => ({ ...prev, current: i + 1, lastSpot: spot.spotName }));

                try {
                    // 2. 구글 상세 정보 페치
                    const place = new placesLibrary.Place({ id: spot.placeId! });
                    await place.fetchFields({
                        fields: [
                            'displayName', 'formattedAddress', 'location',
                            'types', 'googleMapsURI', 'websiteURI',
                            'regularOpeningHours', 'photos'
                        ]
                    });

                    // 3. 데이터 가공
                    const addrParts = place.formattedAddress?.split(' ') || [];
                    const shortAddr = addrParts.length > 2 ? addrParts.slice(1).join(' ') : (place.formattedAddress || "");
                    const openingHours = place.regularOpeningHours?.weekdayDescriptions || [];
                    const photoUrl = place.photos && place.photos.length > 0
                        ? place.photos[0].getURI({ maxWidth: 800 })
                        : null;

                    const updateReq: SpotUpdateRequest = {
                        spotName: place.displayName || spot.spotName,
                        spotType: mapGoogleTypeToSpotType(place.types),
                        address: place.formattedAddress || spot.address,
                        shortAddress: shortAddr,
                        website: place.websiteURI || spot.website || '',
                        googleMapUrl: place.googleMapsURI || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName || '')}&query_place_id=${spot.placeId}`,
                        description: spot.description || '',
                        lat: place.location?.lat() || spot.lat,
                        lng: place.location?.lng() || spot.lng,
                        isVisit: spot.isVisit,
                        metadata: {
                            ...spot.metadata,
                            originalTypes: place.types || [],
                            openingHours: openingHours,
                            photoUrl: photoUrl
                        }
                    };

                    // 4. 서버 업데이트
                    await spotDataUpdate(spot.placeId, updateReq);
                    addLog(`성공: ${spot.spotName}`);

                } catch (singleErr) {
                    addLog(`❌ 실패 [${spot.spotName}]: ${singleErr instanceof Error ? singleErr.message : 'Unknown'}`);
                }
            }
            addLog("🏁 모든 데이터 보정 작업이 끝났습니다.");
            alert("일괄 갱신 완료!");
        } catch (err) {
            addLog("🔥 치명적 오류 발생");
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
                {/* 헤더 */}
                <div className="bg-gray-900 p-8 text-white">
                    <h1 className="text-2xl font-black mb-2 flex items-center gap-3">
                        <span className="text-3xl">🛠</span> 데이터 관리 센터
                    </h1>
                    <p className="text-gray-400 text-sm">
                        기존 장소 데이터에 누락된 구글 상세 정보(영업시간, 사진 등)를 일괄 보정합니다.
                    </p>
                </div>

                <div className="p-8">
                    {/* 컨트롤 섹션 */}
                    <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-100">
                        <div className="space-y-1">
                            <p className="font-bold text-gray-800">전체 장소 동기화</p>
                            <p className="text-xs text-gray-500">Google Places API (New)를 사용하여 데이터를 갱신합니다.</p>
                        </div>
                        <button
                            onClick={handleUpdateAllSpots}
                            disabled={isUpdating || !placesLibrary}
                            className={`px-8 py-3 rounded-2xl font-black transition-all active:scale-95 ${
                                isUpdating || !placesLibrary
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-xl shadow-blue-200'
                            }`}
                        >
                            {!placesLibrary ? "라이브러리 로드 중..." : isUpdating ? "갱신 중..." : "동기화 시작"}
                        </button>
                    </div>

                    {/* 상태 진행바 */}
                    {isUpdating && (
                        <div className="mb-8 space-y-3">
                            <div className="flex justify-between items-end">
                                <span className="text-xs font-black text-blue-600 uppercase">Processing...</span>
                                <span className="text-sm font-mono font-bold text-gray-600">{status.current} / {status.total}</span>
                            </div>
                            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden border border-gray-50 shadow-inner">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 ease-out"
                                    style={{ width: `${(status.current / status.total) * 100}%` }}
                                />
                            </div>
                            <p className="text-center text-sm font-bold text-gray-500 italic">
                                "{status.lastSpot}" 갱신 중...
                            </p>
                        </div>
                    )}

                    {/* 로그 패널 */}
                    <div className="space-y-3">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">System Logs</p>
                        <div className="bg-gray-50 rounded-2xl p-6 h-96 overflow-y-auto font-mono text-xs border border-gray-100 shadow-inner">
                            {logs.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-gray-400 italic">
                                    상단의 시작 버튼을 누르면 로그가 표시됩니다.
                                </div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className={`mb-2 pb-2 border-b border-gray-200 last:border-0 ${
                                        log.includes('❌') ? 'text-red-500' :
                                            log.includes('✅') || log.includes('성공') ? 'text-emerald-600' :
                                                'text-gray-600'
                                    }`}>
                                        {log}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <p className="mt-6 text-center text-gray-400 text-[10px] uppercase font-bold tracking-tighter">
                YUME Admin Tool • Powered by Google Places API
            </p>
        </div>
    );
}