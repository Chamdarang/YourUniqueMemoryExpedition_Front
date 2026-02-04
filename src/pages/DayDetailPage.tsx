// ✅ [필수] google 객체 전역 선언
import {makeStaticGoogleMap} from "../api/mapApi.ts";

declare let google: any;

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import {
    DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove, sortableKeyboardCoordinates
} from "@dnd-kit/sortable";
import {
    APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, InfoWindow, Pin
} from "@vis.gl/react-google-maps";

// API
import { getPlanDayDetail, updatePlanDay, swapPlanDay } from "../api/dayApi";
import { getSchedulesByDay, syncSchedules } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi";

// Types
import type { PlanDayDetailResponse } from "../types/planday";
import type { DayScheduleResponse, ScheduleItemRequest } from "../types/schedule";
import type { SwapMode } from "../types/enums";
import type { SpotCreateRequest } from "../types/spot";

// Components & Utils
import DayScheduleList from "../components/day/DayScheduleList";
import PlanDaySwapModal from "../components/day/PlanDaySwapModal";
import { recalculateSchedules } from "../utils/scheduleUtils";
import {
    DayScheduleExportView,
    ImageExportModal,
    useScheduleExport,
    getStaticMapQuery,
    decodeTempSpot,
    type ExportSection,
} from "../components/common/ScheduleExport";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const scrollbarHideStyle = `.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;

// 🗺️ 지도 경로 컴포넌트
function MapDirections({ schedules, mapViewMode }: { schedules: DayScheduleResponse[], mapViewMode: 'ALL' | 'PINS' | 'NONE' }) {
    const map = useMap();
    const mapsLibrary = useMapsLibrary("maps");
    const polylineRef = useRef<google.maps.Polyline | null>(null);

    useEffect(() => {
        if (!map || !mapsLibrary) return;
        if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }
        if (mapViewMode !== 'ALL') return;

        const path = schedules.map(s => {
            const temp = decodeTempSpot(s.memo);
            // @ts-ignore
            const lat = Number(s.lat || s.spot?.lat || temp?.lat);
            // @ts-ignore
            const lng = Number(s.lng || s.spot?.lng || temp?.lng);
            return { lat, lng };
        }).filter(p => !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0);

        if (path.length > 0) {
            const newPolyline = new mapsLibrary.Polyline({
                path, geodesic: true, strokeColor: "#3B82F6", strokeOpacity: 0.8, strokeWeight: 5,
                icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }]
            });
            newPolyline.setMap(map);
            polylineRef.current = newPolyline;
            const bounds = new google.maps.LatLngBounds();
            path.forEach(p => bounds.extend(p));

            if (!bounds.isEmpty()) {
                const currentBounds = map.getBounds();
                const isAllVisible = currentBounds && currentBounds.contains(bounds.getNorthEast()) && currentBounds.contains(bounds.getSouthWest());
                if (!isAllVisible) map.fitBounds(bounds, 50);
            }
        }
        return () => { if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; } };
    }, [map, mapsLibrary, schedules, mapViewMode]);
    return null;
}

function NumberedMarker({ number, color = "#3B82F6", onClick }: { number: number, color?: string, onClick?: () => void }) {
    return (
        <div onClick={onClick} className="relative flex flex-col items-center justify-center filter drop-shadow-md cursor-pointer hover:-translate-y-1 transition-transform group">
            <svg width="30" height="40" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2"/>
            </svg>
            <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>
        </div>
    );
}

export default function DayDetailPage() {
    return (
        <div className="w-full h-full relative overflow-hidden bg-white">
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'geocoding', 'marker', 'maps']} language="ko" region="KR" version="beta">
                <DayDetailContent />
            </APIProvider>
        </div>
    );
}

function DayDetailContent() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dayId = Number(id);

    const [day, setDay] = useState<PlanDayDetailResponse | null>(null);
    const [schedules, setSchedules] = useState<DayScheduleResponse[]>([]);
    const [initialDay, setInitialDay] = useState<PlanDayDetailResponse | null>(null);
    const [initialSchedules, setInitialSchedules] = useState<DayScheduleResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDirty, setIsDirty] = useState(false);
    const [titleForm, setTitleForm] = useState("");
    const [memoForm, setMemoForm] = useState("");
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');
    const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
    const [mapViewMode, setMapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
    const [showInjury, setShowInjury] = useState(false);

    const { isExportModalOpen, openExportModal, closeExportModal, exportOptions, setExportOptions, handleSaveImage } = useScheduleExport();
    const exportRef = useRef<HTMLDivElement>(null);
    const [generatedMapUrl, setGeneratedMapUrl] = useState<string | null>(null);
    const [mapVersion, setMapVersion] = useState(0);
    const [pickingTarget, setPickingTarget] = useState<{ dayId: number, scheduleId: number } | null>(null);
    const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);

    const geocodingLibrary = useMapsLibrary("geocoding");
    const [geocoder, setGeocoder] = useState<google.maps.Geocoder | null>(null);
    useEffect(() => { if (geocodingLibrary) setGeocoder(new geocodingLibrary.Geocoder()); }, [geocodingLibrary]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    useEffect(() => {
        setDay(null);
        setSchedules([]);
        setTitleForm("");
        setMemoForm("");
        setGeneratedMapUrl(null);
    }, [dayId]);

    const fetchData = useCallback(async () => {
        if (!dayId) return;
        try {
            setLoading(true);
            const [dayData, schedulesData] = await Promise.all([getPlanDayDetail(dayId), getSchedulesByDay(dayId)]);
            setDay(dayData); setInitialDay(dayData); setTitleForm(dayData.dayName); setMemoForm(dayData.memo || "");
            const calculated = recalculateSchedules(Array.isArray(schedulesData) ? schedulesData : []);
            setSchedules(calculated); setInitialSchedules(calculated);
            setIsDirty(false);
        } catch (err) { alert("데이터 로드 실패"); navigate('/days'); } finally { setLoading(false); }
    }, [dayId, navigate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (!initialDay || !day) return;
        const isChanged = initialDay.dayName !== titleForm || (initialDay.memo || "") !== memoForm || JSON.stringify(initialSchedules) !== JSON.stringify(schedules);
        setIsDirty(isChanged);
    }, [titleForm, memoForm, schedules, initialDay, initialSchedules]);

    const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => { if (blocker.state === "blocked") { if (window.confirm("변경사항이 있습니다. 이동할까요?")) blocker.proceed(); else blocker.reset(); } }, [blocker]);

    const handleUpdateDayInfo = async () => {
        if (!dayId || !titleForm.trim()) return;
        try { await updatePlanDay(dayId, { dayName: titleForm, memo: memoForm }); } catch { alert("수정 실패"); }
    };

    const handleSaveAll = async () => {
        try {
            const finalSchedules = recalculateSchedules(schedules);
            const syncReq: ScheduleItemRequest[] = finalSchedules.map((s, idx) => ({
                id: s.id < 0 ? null : s.id, scheduleOrder: idx + 1, spotId: s.spotId,
                startTime: s.startTime, duration: s.duration, endTime: s.endTime,
                movingDuration: s.movingDuration, transportation: s.transportation, memo: s.memo, movingMemo: s.movingMemo
            }));
            const res = await syncSchedules(dayId, { schedules: syncReq });
            const recalculated = recalculateSchedules(res);
            setSchedules(recalculated); setInitialSchedules(recalculated);
            await handleUpdateDayInfo(); setIsDirty(false); alert("저장 완료 ✅");
        } catch { alert("저장 실패"); }
    };

    const handleSwapSubmit = async (targetPlanId: number, targetDayOrder: number, swapMode: SwapMode) => {
        try {
            await swapPlanDay({ sourceDayId: dayId, targetPlanId, targetDayOrder, swapMode });
            alert("이동되었습니다.");
            setIsSwapModalOpen(false);
            navigate(`/plans/${targetPlanId}`);
        } catch { alert("이동 중 오류 발생"); }
    };

    const handleMapClick = useCallback(async (e: any) => {
        if (!pickingTarget || !geocoder) return;
        if (e.domEvent) e.domEvent.stopPropagation();
        const { lat, lng } = e.detail.latLng;
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
                setTempSelectedSpot({
                    spotName: results[0].address_components[0]?.long_name || "지도 위치", spotType: 'OTHER', address: results[0].formatted_address,
                    lat, lng, placeId: results[0].place_id, isVisit: false, metadata: {}, googleMapUrl: "", shortAddress: "", website: "", description: ""
                });
            }
        });
    }, [pickingTarget, geocoder]);

    const handleConfirmRegister = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { scheduleId } = pickingTarget;
        try {
            const savedSpot = await createSpot(tempSelectedSpot);
            setSchedules(prev => recalculateSchedules(prev.map(s => s.id === scheduleId ? {
                ...s, spotId: savedSpot.id, spotName: savedSpot.spotName, spotType: savedSpot.spotType, lat: savedSpot.lat, lng: savedSpot.lng, address: savedSpot.address, isVisit: savedSpot.isVisit
            } : s)));
            setTempSelectedSpot(null); setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
        } catch { alert("장소 등록 실패"); }
    };

    const handleConfirmScheduleOnly = () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { scheduleId } = pickingTarget;
        setSchedules(prev => recalculateSchedules(prev.map(s => s.id === scheduleId ? {
            ...s, spotName: tempSelectedSpot.spotName, spotType: tempSelectedSpot.spotType, lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng,
            memo: cleanMemoTags(s.memo)
        } : s)));
        setTempSelectedSpot(null); setPickingTarget(null);
        if (window.innerWidth < 768) setMobileViewMode('LIST');
    };

    const cleanMemoTags = (memo: string) => memo.replace(/#si:\s*\d+/g, '').replace(/#mi:\s*\d+/g, '').replace(/#visited/g, '').split(' #tmp:')[0].trim();

    const handleExportClick = () => {
        // 단일 일정은 이미 로드되어 있으므로 바로 모달 오픈
        openExportModal();
    };
    const onModalConfirm = async (mapState?: { center: { lat: number, lng: number }, zoom: number }) => {
        const query = getStaticMapQuery(schedules, mapState);

        if (query) {
            try {
                const blobUrl = await makeStaticGoogleMap(query);
                setGeneratedMapUrl(prev => { if(prev) URL.revokeObjectURL(prev); return blobUrl; });
                setMapVersion(v => v + 1);
            } catch(e) {
                console.error(e);
                alert("지도 생성 실패");
                return;
            }
        }
        requestAnimationFrame(() => handleSaveImage(titleForm, exportRef.current));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setSchedules(items => {
                const oldIdx = items.findIndex(i => i.id === active.id);
                const newIdx = items.findIndex(i => i.id === over.id);
                return recalculateSchedules(arrayMove(items, oldIdx, newIdx));
            });
        }
    };

    const handleUpdateLocal = (id: number, data: any) => {
        setSchedules(prev => recalculateSchedules(prev.map(s => s.id === id ? {...s, ...data} : s)));
    };

    const exportSections: ExportSection[] = [{
        id: dayId,
        title: titleForm || "Day Schedule",
        memo: memoForm,
        schedules: schedules
    }];


    if (loading || !day) return <div className="p-10 text-center font-bold">로딩 중...</div>;

    return (
        <div className="flex flex-col w-full h-full relative overflow-hidden bg-white text-left font-sans">
            <style>{scrollbarHideStyle}</style>

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
                isOpen={isExportModalOpen}
                onClose={closeExportModal}
                onConfirm={onModalConfirm}
                options={exportOptions}
                setOptions={setExportOptions}
                schedules={schedules}
            />

            <div className="flex flex-1 w-full h-full relative overflow-hidden md:flex-row">

                {/* 🗺️ [1] 지도 영역 */}
                <div className={`absolute inset-0 z-20 bg-gray-50 transition-transform duration-300 md:relative md:w-1/2 md:translate-x-0 ${mobileViewMode === 'MAP' ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="absolute top-4 right-4 z-50 flex gap-2">
                        <button onClick={() => setMapViewMode(mapViewMode === 'ALL' ? 'PINS' : mapViewMode === 'PINS' ? 'NONE' : 'ALL')} className="px-4 py-2 rounded-full text-xs font-bold shadow-md transition border bg-white text-blue-600 hover:bg-gray-50">
                            {mapViewMode === 'ALL' ? '🗺️ 핀+경로' : mapViewMode === 'PINS' ? '📍 핀만 보기' : '🙈 지도 숨김'}
                        </button>
                    </div>
                    {pickingTarget && (
                        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg border-2 border-white cursor-pointer hover:bg-green-700 transition" onClick={() => { setPickingTarget(null); setTempSelectedSpot(null); }}>
                            <span className="font-bold text-sm">📍 지도에서 위치를 클릭하세요!</span><span className="bg-white/20 px-2 py-0.5 rounded text-xs">취소 X</span>
                        </div>
                    )}

                    <Map defaultCenter={{ lat: 34.9858, lng: 135.7588 }} defaultZoom={13} mapId="YUME_DAY_MAP" disableDefaultUI className="w-full h-full" onClick={handleMapClick}>
                        <MapDirections schedules={schedules} mapViewMode={mapViewMode} />
                        {mapViewMode !== 'NONE' && schedules.map((s, idx) => {
                            const temp = decodeTempSpot(s.memo);
                            const lat = Number(s.lat || s.spot?.lat || temp?.lat);
                            const lng = Number(s.lng || s.spot?.lng || temp?.lng);
                            if (!lat || !lng) return null;
                            return <AdvancedMarker key={s.id} position={{ lat, lng }} onClick={() => setSelectedScheduleId(s.id)}><NumberedMarker number={idx + 1} color={selectedScheduleId === s.id ? "#EF4444" : "#3B82F6"} /></AdvancedMarker>;
                        })}
                        {tempSelectedSpot && (
                            <>
                                <AdvancedMarker position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }}><Pin background={'#22c55e'} borderColor={'#15803d'} glyphColor={'white'} /></AdvancedMarker>
                                <InfoWindow position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }} onCloseClick={() => setTempSelectedSpot(null)} headerContent={<div className="font-bold text-sm">{tempSelectedSpot.spotName}</div>}>
                                    <div className="p-1 min-w-[200px]">
                                        <p className="text-xs text-gray-500 mb-3">{tempSelectedSpot.address}</p>
                                        <div className="flex gap-2">
                                            <button onClick={handleConfirmScheduleOnly} className="flex-1 bg-white border border-gray-300 text-gray-700 text-[10px] py-2 rounded-lg hover:bg-gray-50 font-bold">일정에만 추가</button>
                                            <button onClick={handleConfirmRegister} className="flex-1 bg-green-600 text-white text-[10px] py-2 rounded-lg hover:bg-green-700 font-bold">내 장소 등록 & 추가</button>
                                        </div>
                                    </div>
                                </InfoWindow>
                            </>
                        )}
                    </Map>

                    <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-6 pointer-events-none">
                        <button
                            onClick={() => setMobileViewMode('LIST')}
                            className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform"
                        >
                            🔙 목록 보기
                        </button>
                    </div>
                </div>

                {/* 📋 [2] 리스트 영역 */}
                <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
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
                                selectedScheduleId={selectedScheduleId}
                                showInjury={showInjury}
                                onSelect={setSelectedScheduleId}
                                onUpdate={handleUpdateLocal}
                                onDelete={id => setSchedules(prev => prev.filter(s => s.id !== id))}
                                onInsert={idx => setSchedules(prev => {
                                    const newList = [...prev];
                                    newList.splice(idx, 0, { id: -Date.now(), dayId, scheduleOrder: 0, spotId: 0, spotName: "", spotType: "OTHER", startTime: "10:00", duration: 60, movingDuration: 0, transportation: 'WALK', memo: '', movingMemo: '', isVisit: false, lat: 0, lng: 0 });
                                    return recalculateSchedules(newList);
                                })}
                                dayId={dayId}
                                pickingTarget={pickingTarget}
                                setPickingTarget={setPickingTarget}
                            />
                        </DndContext>
                    </div>

                    <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full px-6 pointer-events-none">
                        <button
                            onClick={() => setMobileViewMode('MAP')}
                            className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform"
                        >
                            🗺️ 지도 보기
                        </button>
                    </div>
                </div>
            </div>
            <PlanDaySwapModal isOpen={isSwapModalOpen} onClose={() => setIsSwapModalOpen(false)} onSubmit={handleSwapSubmit} currentDayName={titleForm} />
        </div>
    );
}