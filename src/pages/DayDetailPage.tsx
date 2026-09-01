import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, InfoWindow, Pin, type MapMouseEvent } from "@vis.gl/react-google-maps";

// API & Hook
import { getPlanDayDetail, updatePlanDay } from "../api/dayApi";
import { createSpot } from "../api/spotApi";
import { makeStaticGoogleMap } from "../api/mapApi";
import { applyDayRouteEstimates, auditDayRoute } from "../api/routeApi";
import { useSchedule } from "../hooks/useSchedule"; // ✅ useSchedule 훅 임포트

// Components
import DayScheduleList from "../components/day/DayScheduleList";
import DayRouteAuditModal from "../components/day/DayRouteAuditModal";

// Types & Utils
import type { PlanDayDetailResponse } from "../types/planDay.ts";
import type { DayScheduleResponse, ScheduleCreateRequest, ScheduleUpdateRequest } from "../types/schedule";
import type { SpotCreateRequest } from "../types/spot";
import type { DayRouteAuditLeg, DayRouteAuditResponse } from "../types/route";

// ✅ Export 관련 컴포넌트
import {
    ImageExportModal,
    DayScheduleExportView
} from "../components/common/ScheduleExport";
import { useScheduleExport } from "../components/common/useScheduleExport";
import { getStaticMapQuery } from "../components/common/scheduleExportUtils";
import { useFeedback } from "../components/common/useFeedback";
import { drawAuditedRouteLeg } from "../utils/mapRoutePolylines";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const scrollbarHideStyle = `.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;

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

function MapDirections({ schedules, mapViewMode, auditResult }: { schedules: DayScheduleResponse[], mapViewMode: 'ALL' | 'PINS' | 'NONE', auditResult: DayRouteAuditResponse | null }) {
    const map = useMap();
    const mapsLibrary = useMapsLibrary("maps");
    const polylineRefs = useRef<google.maps.Polyline[]>([]);

    useEffect(() => {
        const clearPolylines = () => {
            polylineRefs.current.forEach(polyline => polyline.setMap(null));
            polylineRefs.current = [];
        };

        clearPolylines();
        if (!map || !mapsLibrary) return;
        if (mapViewMode !== 'ALL') return;

        const scheduleById = new globalThis.Map(schedules.map(schedule => [schedule.id, schedule]));
        const fallbackLegs = schedules
            .slice(1)
            .map((to, index) => ({ from: schedules[index], to }));
        const legs = auditResult
            ? auditResult.legs.map(leg => ({ leg, from: scheduleById.get(leg.fromScheduleId), to: scheduleById.get(leg.toScheduleId) }))
            : fallbackLegs.map(({ from, to }) => ({ leg: null, from, to }));
        const bounds = new google.maps.LatLngBounds();

        for (const { leg, from, to } of legs) {
            if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) continue;
            if (leg) {
                const drawing = drawAuditedRouteLeg({ mapsLibrary, map, leg, from, to });
                if (!drawing) continue;
                if (!drawing.actualRoute) {
                    const connector = new mapsLibrary.Polyline({
                        path: [
                            { lat: Number(from.lat), lng: Number(from.lng) },
                            { lat: Number(to.lat), lng: Number(to.lng) },
                        ],
                        geodesic: true,
                        strokeColor: '#3B82F6',
                        strokeOpacity: 0.8,
                        strokeWeight: 5,
                        zIndex: 10,
                        icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }],
                    });
                    connector.setMap(map);
                    polylineRefs.current.push(connector);
                }
                polylineRefs.current.push(...drawing.polylines);
                drawing.path.forEach(point => bounds.extend(point));
                continue;
            }

            const path = [
                { lat: Number(from.lat), lng: Number(from.lng) },
                { lat: Number(to.lat), lng: Number(to.lng) },
            ];
            const fallback = new mapsLibrary.Polyline({
                path,
                geodesic: true,
                strokeColor: '#3B82F6',
                strokeOpacity: 0.8,
                strokeWeight: 5,
                zIndex: 10,
                icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }],
            });
            fallback.setMap(map);
            polylineRefs.current.push(fallback);
            path.forEach(point => bounds.extend(point));
        }
        if (!bounds.isEmpty()) map.fitBounds(bounds);
        return clearPolylines;
    }, [map, mapsLibrary, schedules, mapViewMode, auditResult]);
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
    const { confirm, runUndoable, showToast } = useFeedback();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dayId = Number(id);

    // ✅ 1. 스케줄 관리를 useSchedule 훅으로 전면 이관
    const {
        schedules,
        fetchSchedules,
        addSchedule,
        updateSchedule,
        removeSchedule,
        toggleVisit,
        reorderSchedule,
        replaceSchedules
    } = useSchedule();

    const [dayDetail, setDayDetail] = useState<PlanDayDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);

    // UI State
    const [mapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
    const [showInjury, setShowInjury] = useState(false);
    const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');
    const [routeAuditLoading, setRouteAuditLoading] = useState(false);
    const [routeAuditResult, setRouteAuditResult] = useState<DayRouteAuditResponse | null>(null);
    const [routeAuditOpen, setRouteAuditOpen] = useState(false);
    const [routeAuditCheckedAt, setRouteAuditCheckedAt] = useState<number | null>(null);
    const auditedRouteFingerprintRef = useRef<string | null>(null);
    const [routeApplyLoading, setRouteApplyLoading] = useState(false);
    const routeAuditLegCount = Math.max(0, schedules.length - 1);
    const routeAuditFingerprint = useMemo(() => JSON.stringify(
        schedules.map(schedule => ({
            id: schedule.id,
            order: schedule.scheduleOrder,
            lat: schedule.lat,
            lng: schedule.lng,
            transportation: schedule.transportation,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            duration: schedule.duration,
            movingDuration: schedule.movingDuration,
            fixedStartTime: schedule.fixedStartTime,
        }))
    ), [schedules]);
    const routeAuditStale = routeAuditResult != null
        && auditedRouteFingerprintRef.current != null
        && auditedRouteFingerprintRef.current !== routeAuditFingerprint;

    // Header Editing State
    const [titleForm, setTitleForm] = useState("");
    const [memoForm, setMemoForm] = useState("");

    // Map Interaction
    const [pickingTarget, setPickingTarget] = useState<{ dayId: number, scheduleId: number } | null>(null);
    const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);
    const geocodingLibrary = useMapsLibrary("geocoding");
    const geocoder = useMemo(
        () => geocodingLibrary ? new geocodingLibrary.Geocoder() : null,
        [geocodingLibrary]
    );

    // Export State
    const { isExportModalOpen, openExportModal, closeExportModal, exportOptions, setExportOptions, handleSaveImage } = useScheduleExport();
    const exportRef = useRef<HTMLDivElement>(null);
    const [generatedMapUrl, setGeneratedMapUrl] = useState<string | null>(null);
    const [mapVersion, setMapVersion] = useState(0);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    // ✅ 데이터 로드 (일차 정보 + 스케줄 목록)
    useEffect(() => {
        if (!dayId) return;
        setRouteAuditResult(null);
        setRouteAuditOpen(false);
        setRouteAuditCheckedAt(null);
        auditedRouteFingerprintRef.current = null;

        // 일차 기본 정보 조회
        getPlanDayDetail(dayId).then(data => {
            setDayDetail(data);
            setTitleForm(data.dayName);
            setMemoForm(data.memo || "");
        }).catch(() => showToast({ message: "일차 정보를 불러오지 못했습니다.", type: 'error' }));

        // 스케줄 목록 조회 (훅 사용)
        fetchSchedules(dayId).finally(() => setLoading(false));
    }, [dayId, fetchSchedules, showToast]);

    // ✅ 개별 헤더 정보 저장 (이름/메모)
    const handleUpdateDayInfo = async () => {
        if (!dayId || !titleForm.trim()) return;
        try {
            await updatePlanDay(dayId, { dayName: titleForm, memo: memoForm });
            showToast({ message: '일차 정보를 수정했습니다.', type: 'success' });
        } catch {
            showToast({ message: "일차 정보를 수정하지 못했습니다.", type: 'error' });
        }
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
    const handleMapClick = useCallback(async (e: MapMouseEvent) => {
        if (!pickingTarget || !geocoder) return;
        if (e.domEvent) e.domEvent.stopPropagation();

        try {
        if (e.detail?.placeId) {
            const place = new google.maps.places.Place({ id: e.detail.placeId });
            await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI', 'websiteURI', 'regularOpeningHours', 'photos']
            });

            const addrParts = place.formattedAddress?.split(' ') || [];
            const shortAddr = addrParts.length > 2 ? addrParts.slice(1).join(' ') : (place.formattedAddress || "");

            setTempSelectedSpot({
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
                    openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
                    photoUrl: place.photos?.[0]?.getURI({ maxWidth: 800 }) || null
                }
            });
            return;
        }

        const clickedLocation = e.detail?.latLng;
        if (!clickedLocation) return;
        const { results } = await geocoder.geocode({ location: clickedLocation });
        const result = results[0];
        const lat = clickedLocation.lat;
        const lng = clickedLocation.lng;
        setTempSelectedSpot({
            spotName: result?.address_components?.[0]?.long_name || result?.formatted_address || '지도에서 선택한 위치',
            spotType: 'OTHER',
            address: result?.formatted_address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            lat,
            lng,
            placeId: result?.place_id || `map:${lat.toFixed(6)},${lng.toFixed(6)}`,
            isVisit: false,
            metadata: { source: 'map_click' }
        });
        } catch {
            showToast({ message: "선택한 위치의 장소 정보를 불러오지 못했습니다.", type: 'error' });
        }
    }, [pickingTarget, geocoder, showToast]);

    // ✅ 일정에만 추가 (임시 장소로 업데이트)
    const handleConfirmScheduleOnly = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { scheduleId } = pickingTarget;

        const updateReq: ScheduleUpdateRequest = {
            spotUserId: 0,
            spotName: tempSelectedSpot.spotName,
            lat: tempSelectedSpot.lat,
            lng: tempSelectedSpot.lng,
            spotType: tempSelectedSpot.spotType,
        };

        try {
            await updateSchedule(scheduleId, updateReq);
            setTempSelectedSpot(null); setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : "일정에 장소를 추가하지 못했습니다.", type: 'error' });
        }
    };

    // ✅ 내 장소 등록 후 추가
    const handleConfirmRegister = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { scheduleId } = pickingTarget;
        try {
            const savedSpot = await createSpot(tempSelectedSpot);
            const updateReq: ScheduleUpdateRequest = {
                spotUserId: savedSpot.id,
                spotName: savedSpot.displayName?.trim() || savedSpot.spotName,
                lat: savedSpot.lat,
                lng: savedSpot.lng,
                spotType: savedSpot.spotType,
            };
            await updateSchedule(scheduleId, updateReq);
            setTempSelectedSpot(null); setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
            showToast({ message: "내 장소에 등록하고 일정에 선택했습니다.", type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : "장소 등록에 실패했습니다.", type: 'error' });
        }
    };

    // ✅ 리스트 조작 핸들러 (훅으로 직접 연결)
    const handleScheduleInsert = async (index: number) => {
        if (!dayId) return;
        await addSchedule(dayId, { scheduleOrder: index });
    };

    const handleRouteAudit = async (force = false) => {
        if (!dayId || routeAuditLoading) return;
        if (routeAuditResult && !force) {
            setRouteAuditOpen(true);
            return;
        }
        if (routeAuditLegCount > 10 && !await confirm({
            title: '하루 전체 경로 점검',
            message: `최대 ${routeAuditLegCount}개 구간을 점검합니다. 캐시에 없는 구간은 외부 경로 API를 호출합니다.`,
            confirmLabel: '점검 시작',
        })) return;
        setRouteAuditLoading(true);
        try {
            const result = await auditDayRoute(dayId);
            setRouteAuditResult(result);
            auditedRouteFingerprintRef.current = routeAuditFingerprint;
            setRouteAuditCheckedAt(Date.now());
            setRouteAuditOpen(true);
        } catch (error) {
            showToast({
                message: error instanceof Error ? error.message : '하루 전체 경로를 점검하지 못했습니다.',
                type: 'error',
            });
        } finally {
            setRouteAuditLoading(false);
        }
    };

    const applyAuditLegs = async (legs: DayRouteAuditLeg[]) => {
        const applicable = legs.filter((leg): leg is DayRouteAuditLeg & { estimatedDurationMinutes: number } =>
            leg.estimatedDurationMinutes != null
        );
        if (!dayId || applicable.length === 0 || routeApplyLoading) return;
        if (applicable.length > 1 && !await confirm({
            title: '예상 이동시간 전체 적용',
            message: `계산된 ${applicable.length}개 구간의 이동시간을 반영할까요?\n각 구간의 이동 인저리타임은 그대로 유지됩니다.`,
            confirmLabel: '전체 적용',
        })) return;

        setRouteApplyLoading(true);
        try {
            const updated = await applyDayRouteEstimates(dayId, applicable.map(leg => ({
                scheduleId: leg.toScheduleId,
                estimatedDurationMinutes: leg.estimatedDurationMinutes,
            })));
            replaceSchedules(updated);
            setRouteAuditOpen(false);
            showToast({ message: `${applicable.length}개 구간의 예상 이동시간을 적용했습니다.`, type: 'success' });
        } catch (error) {
            showToast({
                message: error instanceof Error ? error.message : '예상 이동시간을 적용하지 못했습니다.',
                type: 'error',
            });
        } finally {
            setRouteApplyLoading(false);
        }
    };

    const handleQuickAdd = async (request: ScheduleCreateRequest) => {
        if (!dayId) return false;
        return addSchedule(dayId, request);
    };

    const handleScheduleDelete = (scheduleId: number) => {
        runUndoable({
            key: `schedule-delete:${scheduleId}`,
            message: '세부 일정을 6초 후 삭제합니다.',
            successMessage: '세부 일정을 삭제했습니다.',
            commit: async () => { await removeSchedule(scheduleId); },
        });
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const scheduleId = Number(active.id);
            const newIndex = schedules.findIndex(s => s.id === over.id);
            if (newIndex !== -1) {
                // 백엔드 개별 Reorder API 호출
                await reorderSchedule(dayId, scheduleId, { scheduleOrder: newIndex  });
            }
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
                isOpen={isExportModalOpen}
                onClose={closeExportModal}
                onConfirm={() => handleSaveImage(titleForm, exportRef.current)}
                options={exportOptions}
                setOptions={setExportOptions}
                schedules={schedules}
            />

            {routeAuditResult && routeAuditOpen && (
                <DayRouteAuditModal
                    result={routeAuditResult}
                    onClose={() => setRouteAuditOpen(false)}
                    onApplyLeg={leg => void applyAuditLegs([leg])}
                    onApplyAll={() => void applyAuditLegs(routeAuditResult.legs)}
                    onRecalculate={() => void handleRouteAudit(true)}
                    applying={routeApplyLoading}
                    recalculating={routeAuditLoading}
                    checkedAt={routeAuditCheckedAt}
                    stale={routeAuditStale}
                />
            )}

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
                            <MapDirections schedules={schedules} mapViewMode={mapViewMode} auditResult={routeAuditStale ? null : routeAuditResult} />
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
                        {routeAuditResult && !routeAuditStale && (
                            <div className="absolute right-3 top-3 z-40 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-[10px] font-bold text-gray-600 shadow-lg backdrop-blur">
                                <div className="mb-1 font-black text-gray-800">점검 경로</div>
                                <div className="flex items-center gap-1.5"><span className="h-1 w-5 rounded bg-blue-600" /> 실제 경로</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-amber-500" /> 시간 확인 필요</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-gray-400" /> 실제 선형 없음</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-red-500" /> 계산 불가</div>
                            </div>
                        )}
                        <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-6 pointer-events-none">
                            <button onClick={() => setMobileViewMode('LIST')} className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform">🔙 목록 보기</button>
                        </div>
                    </div>

                    {/* [2] 일정 리스트 영역 */}
                    <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
                        {/* 헤더 */}
                        <div className="px-4 py-3 md:px-5 md:py-4 border-b border-gray-100 bg-white/95 backdrop-blur z-30 flex-shrink-0 flex flex-col gap-3">
                            <div className="flex items-center gap-2 w-full">
                                <button onClick={() => navigate(-1)} className="text-gray-400 p-1 hover:bg-gray-100 rounded-full shrink-0">🔙</button>
                                <input
                                    type="text"
                                    className="flex-1 min-w-0 text-xl md:text-2xl font-black text-gray-900 outline-none bg-transparent placeholder-gray-300 truncate"
                                    value={titleForm}
                                    onChange={e => setTitleForm(e.target.value)}
                                    onBlur={handleUpdateDayInfo}
                                    placeholder="일정 제목"
                                />
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
                                <button
                                    type="button"
                                    onClick={() => void handleRouteAudit()}
                                    disabled={routeAuditLoading}
                                    className="p-1.5 px-3 text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition text-xs font-bold flex items-center gap-1 shrink-0 whitespace-nowrap disabled:cursor-wait disabled:opacity-60"
                                >
                                    {routeAuditLoading
                                        ? '경로 점검 중…'
                                        : routeAuditResult
                                        ? `🧭 점검 결과 보기${routeAuditStale ? ' · 변경됨' : ''}`
                                        : `🧭 전체 경로 점검 · ${routeAuditLegCount}구간`}
                                </button>
                            </div>

                            <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                                <textarea
                                    className="w-full bg-transparent outline-none text-sm text-gray-600 resize-none font-medium"
                                    rows={2}
                                    value={memoForm}
                                    onChange={e => setMemoForm(e.target.value)}
                                    onBlur={handleUpdateDayInfo}
                                    placeholder="오늘 일정에 대한 메모를 입력하세요."
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 pb-32 bg-white scrollbar-hide relative z-0">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <DayScheduleList
                                    variant="page"
                                    schedules={schedules} // ✅ 훅의 실시간 상태 연결
                                    showInjury={showInjury}
                                    onUpdate={updateSchedule} // ✅ 훅 함수 직접 전달
                                    onToggleVisit={toggleVisit} // ✅ 훅 함수 직접 전달
                                    onDelete={handleScheduleDelete}
                                    onInsert={handleScheduleInsert}
                                    onQuickAdd={handleQuickAdd}
                                    scheduleMode={dayDetail?.scheduleMode}
                                    onQuickMapPickStart={() => {
                                        setPickingTarget(null);
                                        setTempSelectedSpot(null);
                                        if (window.innerWidth < 768) setMobileViewMode('MAP');
                                    }}
                                    pickingTarget={pickingTarget}
                                    setPickingTarget={(target) => {
                                        setPickingTarget(target);
                                        if (target && window.innerWidth < 768) setMobileViewMode('MAP');
                                    }}
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
