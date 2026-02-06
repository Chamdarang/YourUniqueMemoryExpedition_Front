// ✅ [필수] google 객체 전역 선언
declare let google: any;

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, InfoWindow, Pin } from "@vis.gl/react-google-maps";

// API
import { getPlanDayDetail, updatePlanDay } from "../api/dayApi";
import { getSchedulesByDay, syncSchedules } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi";
// ✅ 지도 생성 API
import { makeStaticGoogleMap } from "../api/mapApi";

// Components
import DayScheduleList from "../components/day/DayScheduleList";

// Types & Utils
import type { PlanDayDetailResponse } from "../types/planDay.ts";
import type { DayScheduleResponse, ScheduleItemRequest } from "../types/schedule";
import type { SpotCreateRequest } from "../types/spot";
import { recalculateSchedules } from "../utils/scheduleUtils";

// ✅ Export 관련 컴포넌트
import {
    ImageExportModal,
    useScheduleExport,
    getStaticMapQuery,
    DayScheduleExportView
} from "../components/common/ScheduleExport";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const scrollbarHideStyle = `.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;

// 🛠️ 임시 장소 파싱 필요 없음 (필드 직접 사용)

function NumberedMarker({ number, color, onClick }: { number: number, color: string, onClick?: () => void }) {
    return (
        <div onClick={onClick} className="relative flex flex-col items-center justify-center filter drop-shadow-md cursor-pointer hover:-translate-y-1 transition-transform group">
            <svg width="30" height="40" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2"/>
            </svg>
            <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>
        </div>
    );
}

function MapDirections({ schedules, mapViewMode }: { schedules: DayScheduleResponse[], mapViewMode: 'ALL' | 'PINS' | 'NONE' }) {
    const map = useMap();
    const mapsLibrary = useMapsLibrary("maps");
    const [polyline, setPolyline] = useState<google.maps.Polyline | null>(null);

    useEffect(() => {
        if (!map || !mapsLibrary) return;
        if (polyline) { polyline.setMap(null); setPolyline(null); }
        if (mapViewMode !== 'ALL') return;

        // ✅ [수정] lat, lng 필드 직접 사용
        const path = schedules.map(s => ({
            lat: Number(s.lat),
            lng: Number(s.lng)
        })).filter(p => !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0);

        if (path.length > 0) {
            const newPolyline = new mapsLibrary.Polyline({
                path, geodesic: true, strokeColor: "#3B82F6", strokeOpacity: 0.8, strokeWeight: 5,
                icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }]
            });
            newPolyline.setMap(map);
            setPolyline(newPolyline);

            const bounds = new google.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));
            if (!bounds.isEmpty()) map.fitBounds(bounds);
        }
        return () => { if (polyline) polyline.setMap(null); };
    }, [map, mapsLibrary, schedules, mapViewMode]);
    return null;
}

export default function DayDetailPage() {
    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'geocoding', 'marker', 'maps']} language="ko" region="KR" version="beta">
            <DayDetailContent />
        </APIProvider>
    );
}

function DayDetailContent() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dayId = Number(id);

    const [dayDetail, setDayDetail] = useState<PlanDayDetailResponse | null>(null);
    const [schedules, setSchedules] = useState<DayScheduleResponse[]>([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [mapViewMode, setMapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
    const [showInjury, setShowInjury] = useState(false);
    const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');

    // Editing State
    const [titleForm, setTitleForm] = useState("");
    const [memoForm, setMemoForm] = useState("");
    const [isHeaderEditing, setIsHeaderEditing] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    // Map Interaction
    const [pickingTarget, setPickingTarget] = useState<{ dayId: number, scheduleId: number } | null>(null);
    const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);
    const geocodingLibrary = useMapsLibrary("geocoding");
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);

    // Export State
    const { isExportModalOpen, openExportModal, closeExportModal, exportOptions, setExportOptions, handleSaveImage } = useScheduleExport();
    const exportRef = useRef<HTMLDivElement>(null);
    const [generatedMapUrl, setGeneratedMapUrl] = useState<string | null>(null);
    const [mapVersion, setMapVersion] = useState(0);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    useEffect(() => { if (geocodingLibrary) setGeocoder(new geocodingLibrary.Geocoder()); }, [geocodingLibrary]);

    // ✅ 데이터 로드
    useEffect(() => {
        if (!dayId) return;
        setLoading(true);
        Promise.all([getPlanDayDetail(dayId), getSchedulesByDay(dayId)])
            .then(([dayData, scheduleData]) => {
                setDayDetail(dayData);
                setTitleForm(dayData.dayName);
                setMemoForm(dayData.memo || "");
                setSchedules(recalculateSchedules(scheduleData));
            })
            .catch(err => { console.error(err); alert("데이터 로드 실패"); })
            .finally(() => setLoading(false));
    }, [dayId]);

    // 뒤로가기 방지
    const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (blocker.state === "blocked") {
            if (window.confirm("저장되지 않은 변경사항이 있습니다. 이동하시겠습니까?")) {
                setIsDirty(false);
                setTimeout(() => blocker.proceed(), 0);
            } else blocker.reset();
        }
    }, [blocker]);

    // ✅ 저장 로직 (spotUserId 사용)
    const handleSaveAll = async () => {
        try {
            const finalSchedules = recalculateSchedules(schedules);
            const syncReq: ScheduleItemRequest[] = finalSchedules.map((s, idx) => ({
                id: s.id < 0 ? null : s.id,
                scheduleOrder: idx + 1,
                // ✅ spotUserId 매핑 (임시 장소면 0)
                spotUserId: s.spotUserId === 0 ? null : s.spotUserId,
                spotName: s.spotName,
                lat: s.lat, lng: s.lng,
                spotType: s.spotType,
                startTime: s.startTime, duration: s.duration, endTime: s.endTime,
                movingDuration: s.movingDuration, transportation: s.transportation,
                memo: s.memo, movingMemo: s.movingMemo,
                isChecked: s.isChecked
            }));

            // 일정 저장
            await syncSchedules(dayId, { schedules: syncReq });

            // 헤더 정보 저장
            await updatePlanDay(dayId, { dayName: titleForm, memo: memoForm });

            setIsDirty(false);
            alert("저장 완료 ✅");

            // 재로딩
            const res = await getSchedulesByDay(dayId);
            setSchedules(recalculateSchedules(res));
        } catch { alert("저장 실패"); }
    };

    // ✅ Export 핸들러
    const handleExportClick = async () => {
        const query = getStaticMapQuery(schedules);
        if (query) {
            try {
                const blobUrl = await makeStaticGoogleMap(query);
                setGeneratedMapUrl(prev => { if(prev) URL.revokeObjectURL(prev); return blobUrl; });
                setMapVersion(v => v + 1);
            } catch (e) { console.error(e); }
        } else {
            setGeneratedMapUrl(null);
        }
        openExportModal();
    };

    // ✅ Map Click & Spot Selection
    const handleMapClick = useCallback(async (e: any) => {
        if (!pickingTarget || !geocoder) return;
        if (e.domEvent) e.domEvent.stopPropagation();

        const processSpotData = (spotReq: SpotCreateRequest) => { setTempSelectedSpot(spotReq); };

        if (e.detail.placeId) {
            // @ts-ignore
            const place = new google.maps.places.Place({ id: e.detail.placeId });
            await place.fetchFields({
                // ✅ 동일하게 필드 추가
                fields: ['displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI', 'websiteURI', 'regularOpeningHours', 'photos']
            });

            const addrParts = place.formattedAddress?.split(' ') || [];
            const shortAddr = addrParts.length > 2 ? addrParts.slice(1).join(' ') : (place.formattedAddress || "");
            const openingHours = place.regularOpeningHours?.weekdayDescriptions || [];
            const photoUrl = place.photos && place.photos.length > 0
                ? place.photos[0].getURI({ maxWidth: 800 })
                : null;

            processSpotData({
                spotName: place.displayName || "선택된 장소",
                spotType: 'OTHER',
                address: place.formattedAddress || "",
                lat: place.location?.lat() || 0,
                lng: place.location?.lng() || 0,
                placeId: e.detail.placeId,
                isVisit: false,
                shortAddress: shortAddr,
                website: place.websiteURI || "",
                googleMapUrl: place.googleMapsURI || "",
                description: "",
                metadata: {
                    originalTypes: place.types || [],
                    openingHours: openingHours, // ✅ 추가
                    photoUrl: photoUrl          // ✅ 추가
                }
            });
        }
    }, [pickingTarget, geocoder]);

    // ✅ 일정에만 추가 (spotUserId = 0)
    const handleConfirmScheduleOnly = () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { scheduleId } = pickingTarget;
        setSchedules(prev => recalculateSchedules(prev.map(s => s.id === scheduleId ? {
            ...s,
            spotUserId: 0,
            spotName: tempSelectedSpot.spotName,
            spotType: tempSelectedSpot.spotType,
            lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng,
            address: tempSelectedSpot.address
        } : s)));
        setTempSelectedSpot(null); setPickingTarget(null);
        setIsDirty(true);
        if (window.innerWidth < 768) setMobileViewMode('LIST');
    };

    // ✅ 내 장소 등록 후 추가
    const handleConfirmRegister = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { scheduleId } = pickingTarget;
        try {
            const savedSpot = await createSpot(tempSelectedSpot);
            setSchedules(prev => recalculateSchedules(prev.map(s => s.id === scheduleId ? {
                ...s,
                spotUserId: savedSpot.id,
                spotName: savedSpot.spotName,
                spotType: savedSpot.spotType,
                lat: savedSpot.lat, lng: savedSpot.lng,
                address: savedSpot.address,
                isVisit: savedSpot.isVisit
            } : s)));
            setTempSelectedSpot(null); setPickingTarget(null);
            setIsDirty(true);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
        } catch { alert("장소 등록 실패"); }
    };

    // 리스트 핸들러들
    const handleScheduleUpdate = (itemId: number, data: any) => {
        setSchedules(prev => {
            const index = prev.findIndex(s => s.id === itemId);
            if (index === -1) return prev;
            const newList = [...prev];
            newList[index] = { ...newList[index], ...data };
            return recalculateSchedules(newList);
        });
        setIsDirty(true);
    };


    const handleUpdateDayInfo = async () => {
        if (!dayId || !titleForm.trim()) return;
        try { await updatePlanDay(dayId, { dayName: titleForm, memo: memoForm }); } catch { alert("수정 실패"); }
    };

    const handleScheduleDelete = (itemId: number) => {
        setSchedules(prev => recalculateSchedules(prev.filter(s => s.id !== itemId)));
        setIsDirty(true);
    };

    const handleScheduleInsert = (index: number) => {
        setSchedules(prev => {
            const newList = [...prev];
            const newItem: DayScheduleResponse = {
                id: -Date.now(), dayId, scheduleOrder: index + 1,
                spotUserId: 0, spotName: "", spotType: "OTHER",
                startTime: "10:00", duration: 60, movingDuration: 0, transportation: 'WALK',
                memo: "", movingMemo: "", isChecked: false, lat: 0, lng: 0
            };
            newList.splice(index, 0, newItem);
            return recalculateSchedules(newList);
        });
        setIsDirty(true);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setSchedules(prev => {
                const oldIndex = prev.findIndex(s => s.id === active.id);
                const newIndex = prev.findIndex(s => s.id === over.id);
                return recalculateSchedules(arrayMove(prev, oldIndex, newIndex));
            });
            setIsDirty(true);
        }
    };

    if (loading || !dayDetail) return <div className="text-center py-20">로딩 중...</div>;

    return (
        <>
            <style>{scrollbarHideStyle}</style>

            {/* 📸 Export Hidden View */}
            <div style={{ position: "fixed", top: 0, left: "-9999px" }}>
                <div ref={exportRef}>
                    <DayScheduleExportView
                        key={`day-export-${dayId}-${mapVersion}`}
                        dayName={titleForm}
                        memo={memoForm}
                        schedules={schedules}
                        options={exportOptions}
                        mapUrl={generatedMapUrl}
                    />
                </div>
            </div>

            <ImageExportModal
                isOpen={isExportModalOpen} onClose={closeExportModal} onConfirm={() => handleSaveImage(titleForm, exportRef.current)} options={exportOptions} setOptions={setExportOptions} mapUrl={generatedMapUrl}
                schedules={schedules}
            />

            <div className="flex flex-col h-full w-full relative overflow-hidden bg-white">
                <div className="flex w-full h-full relative">
                    {/* [1] 지도 영역 */}
                    <div className={`absolute inset-0 z-20 bg-gray-50 transition-transform duration-300 md:relative md:w-1/2 md:translate-x-0 md:z-auto ${mobileViewMode === 'MAP' ? 'translate-x-0' : '-translate-x-full'}`}>
                        {pickingTarget && (
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg border-2 border-white cursor-pointer hover:bg-green-700 transition" onClick={() => { setPickingTarget(null); setTempSelectedSpot(null); }}>
                                <span className="font-bold text-sm">📍 지도에서 위치를 클릭하세요!</span><span className="bg-white/20 px-2 py-0.5 rounded text-xs">취소 X</span>
                            </div>
                        )}
                        <Map defaultCenter={{ lat: 34.9858, lng: 135.7588 }} defaultZoom={13} mapId="DEMO_MAP_ID" disableDefaultUI={true} className="w-full h-full" onClick={handleMapClick} gestureHandling="auto">
                            <MapDirections schedules={schedules} mapViewMode={mapViewMode} />
                            {mapViewMode !== 'NONE' && schedules.map((s, index) => {
                                const lat = Number(s.lat);
                                const lng = Number(s.lng);
                                if (!lat || !lng) return null;
                                return <AdvancedMarker key={s.id} position={{ lat, lng }}><NumberedMarker number={index + 1} color={'#3B82F6'} /></AdvancedMarker>;
                            })}
                            {tempSelectedSpot && (
                                <><AdvancedMarker position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }}><Pin background={'#22c55e'} borderColor={'#15803d'} glyphColor={'white'} /></AdvancedMarker>
                                    <InfoWindow position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }} onCloseClick={() => setTempSelectedSpot(null)} headerContent={<div className="font-bold text-sm">{tempSelectedSpot.spotName}</div>}>
                                        <div className="p-1 min-w-[200px]"><p className="text-xs text-gray-500 mb-3">{tempSelectedSpot.address}</p>
                                            <div className="flex gap-2"><button onClick={handleConfirmScheduleOnly} className="flex-1 bg-white border border-gray-300 text-gray-700 text-xs py-2 rounded-lg hover:bg-gray-50 font-bold">일정에만 추가</button><button onClick={handleConfirmRegister} className="flex-1 bg-green-600 text-white text-xs py-2 rounded-lg hover:bg-green-700 font-bold">내 장소 등록 & 추가</button></div>
                                        </div>
                                    </InfoWindow></>
                            )}
                        </Map>
                        <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-6 pointer-events-none">
                            <button onClick={() => setMobileViewMode('LIST')} className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform">🔙 목록 보기</button>
                        </div>
                    </div>

                    {/* [2] 일정 리스트 영역 */}
                    <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
                        {/* 헤더 */}
                        <div className="px-4 py-3 md:px-5 md:py-4 border-b border-gray-100 bg-white/95 backdrop-blur z-30 flex-shrink-0 flex flex-col gap-3">
                            <div className="flex items-center gap-2 w-full">
                                <button onClick={() => navigate('/days')} className="text-gray-400 p-1 hover:bg-gray-100 rounded-full shrink-0">🔙</button>
                                <input
                                    type="text"
                                    className="flex-1 min-w-0 text-xl md:text-2xl font-black text-gray-900 outline-none bg-transparent placeholder-gray-300 truncate"
                                    value={titleForm}
                                    onChange={e => setTitleForm(e.target.value)}
                                    onBlur={handleUpdateDayInfo}
                                    placeholder="계획 이름"
                                />
                                <button
                                    onClick={handleSaveAll}
                                    disabled={!isDirty}
                                    className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-xs md:text-sm transition shrink-0 whitespace-nowrap ${isDirty ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-400'}`}
                                >
                                    저장
                                </button>
                            </div>

                            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                                <button
                                    onClick={() => setShowInjury(!showInjury)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border shadow-sm shrink-0 whitespace-nowrap ${showInjury ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    ⚽ {showInjury ? '인저리 ON' : 'OFF'}
                                </button>
                                <button onClick={handleExportClick} className="p-1.5 px-3 text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 transition text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap">
                                    📸 저장
                                </button>
                                <button onClick={() => setIsSwapModalOpen(true)} className="p-1.5 px-3 text-blue-500 bg-blue-50 rounded-lg hover:bg-blue-100 transition text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap" title="다른 여행으로 이동">
                                    📦 이동
                                </button>
                            </div>

                            <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                                <textarea className="w-full bg-transparent outline-none text-sm text-gray-600 resize-none font-medium" rows={2} value={memoForm} onChange={e => setMemoForm(e.target.value)} onBlur={handleUpdateDayInfo} placeholder="오늘 일정에 대한 메모를 입력하세요." />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 pb-32 bg-white scrollbar-hide relative z-0">

                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <DayScheduleList
                                    variant="page"
                                    schedules={schedules}
                                    showInjury={showInjury}
                                    onUpdate={handleScheduleUpdate}
                                    onDelete={handleScheduleDelete}
                                    onInsert={handleScheduleInsert}
                                    pickingTarget={pickingTarget}
                                    setPickingTarget={setPickingTarget}
                                    dayId={dayId}
                                />
                            </DndContext>
                        </div>
                        <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-full px-6 pointer-events-none">
                            <button onClick={() => setMobileViewMode('MAP')} className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform">🗺️ 지도 보기</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}