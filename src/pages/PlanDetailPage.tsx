import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useBlocker } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, InfoWindow, Pin, type MapMouseEvent } from "@vis.gl/react-google-maps";

// API
import { exportPlanData, getPlanDetail } from "../api/planApi";
import { createDayInPlan, swapPlanDay, getIndependentDays } from "../api/dayApi";
import { getSchedulesByDay, updateSchedule as updateScheduleApi } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi";
// ✅ 지도 생성 API
import { makeStaticGoogleMap } from "../api/mapApi";

// Components
import PlanHeader from "../components/plan/PlanHeader";
import PlanDayItem from "../components/plan/PlanDayItem";

// Types & Utils
import type { PlanDetailResponse } from "../types/plan";
import type { PlanDayResponse, ScheduleMode } from "../types/planDay.ts";
import type { DayScheduleResponse } from "../types/schedule";
import type { SpotCreateRequest } from "../types/spot";
import { recalculateSchedules } from "../utils/scheduleUtils";

// ✅ Export 관련 컴포넌트
import {
    ImageExportModal,
    PlanScheduleExportView,
    DayScheduleExportView
} from "../components/common/ScheduleExport";
import { useScheduleExport } from "../components/common/useScheduleExport";
import { getStaticMapQuery, type ExportSection } from "../components/common/scheduleExportUtils";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const scrollbarHideStyle = `.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;

const getPlanDayDate = (startDate: string, dayOrder: number) => {
    const [year, month, day] = startDate.split('-').map(Number);
    const date = new Date(year, month - 1, day + dayOrder - 1);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
};

// 🛠️ 임시 장소 파싱 제거됨 (필드 직접 사용)

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

interface MapDirectionsProps {
    daySchedulesMap: Record<number, DayScheduleResponse[]>;
    dayOrderMap: Record<number, number>;
    mapViewMode: 'ALL' | 'PINS' | 'NONE';
    visibleDays: Set<number>;
}

function MapDirections({ daySchedulesMap, dayOrderMap, mapViewMode, visibleDays }: MapDirectionsProps) {
    const map = useMap();
    const mapsLibrary = useMapsLibrary("maps");
    const polylinesRef = useRef<google.maps.Polyline[]>([]);

    useEffect(() => {
        const clearPolylines = () => {
            polylinesRef.current.forEach(polyline => polyline.setMap(null));
            polylinesRef.current = [];
        };

        clearPolylines();
        if (!map || !mapsLibrary) return;
        if (mapViewMode !== 'ALL') return;

        const newPolylines: google.maps.Polyline[] = [];
        const bounds = new google.maps.LatLngBounds();
        let hasPoints = false;

        Object.entries(daySchedulesMap).forEach(([dayIdStr, schedules]) => {
            const dayId = Number(dayIdStr);
            if (!visibleDays.has(dayId)) return;
            if (!schedules) return;

            const dayOrder = dayOrderMap[dayId] || 1;
            const color = getDayColor(dayOrder);
            const path = schedules.map(s => ({
                lat: Number(s.lat),
                lng: Number(s.lng)
            })).filter(pos => !isNaN(pos.lat) && !isNaN(pos.lng) && pos.lat !== 0 && pos.lng !== 0);
            if (path.length > 0) {
                path.forEach(pos => bounds.extend(pos));
                hasPoints = true;
                const polyline = new mapsLibrary.Polyline({
                    path, geodesic: true, strokeColor: color, strokeOpacity: 0.8, strokeWeight: 5,
                    icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }]
                });
                polyline.setMap(map);
                newPolylines.push(polyline);
            }
        });
        polylinesRef.current = newPolylines;

        if (hasPoints && !bounds.isEmpty()) {
            const currentBounds = map.getBounds();
            const isAllVisible = currentBounds && currentBounds.contains(bounds.getNorthEast()) && currentBounds.contains(bounds.getSouthWest());
            if (!isAllVisible) map.fitBounds(bounds);
        }
        return clearPolylines;
    }, [map, mapsLibrary, daySchedulesMap, dayOrderMap, mapViewMode, visibleDays]);
    return null;
}

function EmptySlotModeSelector({ dayOrder, onCreateNew, onImportSelect }: { dayOrder: number, onCreateNew: (scheduleMode: ScheduleMode) => void, onImportSelect: (id: number) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [candidates, setCandidates] = useState<PlanDayResponse[]>([]);
    const [loading, setLoading] = useState(false);

    const loadCandidates = async () => {
        setShowImport(true);
        setLoading(true);
        try {
            setCandidates((await getIndependentDays()).content);
        } catch {
            alert("하루 일정 목록을 불러오지 못했습니다.");
            setShowImport(false);
        } finally {
            setLoading(false);
        }
    };

    if (!isExpanded) {
        return (
            <button type="button" onClick={() => setIsExpanded(true)} className="mb-3 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 text-left font-bold text-gray-400 transition hover:border-blue-400 hover:bg-white hover:text-blue-600">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-200 text-lg">+</span>
                Day {dayOrder} 일정 추가하기
            </button>
        );
    }

    return (
        <div className="mb-4 rounded-2xl border-2 border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-blue-900">Day {dayOrder} 일정 방식 선택</h3>
                <button type="button" onClick={() => { setIsExpanded(false); setShowImport(false); }} className="text-xs font-bold text-gray-400">닫기</button>
            </div>
            {!showImport ? (
                <div className="grid gap-2 sm:grid-cols-3">
                    <button type="button" onClick={() => onCreateNew('SIMPLE')} className="rounded-xl border border-blue-200 bg-white px-3 py-3 font-bold text-blue-700 shadow-sm hover:bg-blue-50">간편 일정<span className="mt-1 block text-[10px] font-medium text-gray-400">장소 · 시간 · 메모</span></button>
                    <button type="button" onClick={() => onCreateNew('DETAILED')} className="rounded-xl border border-orange-200 bg-white px-3 py-3 font-bold text-orange-600 shadow-sm hover:bg-orange-50">상세 일정<span className="mt-1 block text-[10px] font-medium text-gray-400">체류 · 이동 · 교통수단</span></button>
                    <button type="button" onClick={loadCandidates} className="rounded-xl border border-gray-200 bg-white px-3 py-3 font-bold text-gray-600 shadow-sm hover:bg-gray-50">기존 일정 가져오기</button>
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-blue-100 bg-white">
                    <div className="flex items-center justify-between border-b border-blue-50 bg-blue-50/40 px-3 py-2">
                        <button type="button" onClick={() => setShowImport(false)} className="text-xs font-bold text-blue-600 hover:text-blue-800">
                            ← 일정 방식 선택
                        </button>
                        {!loading && candidates.length > 0 && (
                            <span className="text-[10px] font-bold text-gray-400">{candidates.length}개</span>
                        )}
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        {loading ? (
                            <p className="p-6 text-center text-sm text-gray-400">불러오는 중...</p>
                        ) : candidates.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm font-bold text-gray-500">가져올 수 있는 하루 일정이 없습니다.</p>
                                <p className="mt-1 text-xs text-gray-400">내 하루 일정에서 먼저 일정을 만들어 주세요.</p>
                            </div>
                        ) : candidates.map((day) => (
                            <button type="button" key={day.id} onClick={() => onImportSelect(day.id)} className="flex w-full items-center justify-between border-b border-gray-50 p-3 text-left last:border-0 hover:bg-blue-50">
                                <span className="font-bold text-gray-700">{day.dayName}</span>
                                <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500">{day.scheduleMode === 'SIMPLE' ? '간편' : '상세'}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const DAY_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
const getDayColor = (dayOrder: number) => DAY_COLORS[(dayOrder - 1) % DAY_COLORS.length];

// 🚀 Main Page Component
export default function PlanDetailPage() {
    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'geocoding', 'marker', 'maps']} language="ko" region="KR" version="beta">
            <PlanDetailContent />
        </APIProvider>
    );
}

function PlanDetailContent() {
    const { id } = useParams<{ id: string }>();
    const planId = Number(id);
    const [plan, setPlan] = useState<PlanDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [mapSchedulesMap, setMapSchedulesMap] = useState<Record<number, DayScheduleResponse[]>>({});
    const [scheduleRefreshVersions, setScheduleRefreshVersions] = useState<Record<number, number>>({});
    const [dayOrderMap, setDayOrderMap] = useState<Record<number, number>>({});

    const [mapViewMode, setMapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
    const [showInjury, setShowInjury] = useState(false);
    const [visibleDays, setVisibleDays] = useState<Set<number>>(new Set());
    const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');
    const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

    const [pickingTarget, setPickingTarget] = useState<{ dayId: number, scheduleId: number } | null>(null);
    const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);

    // Export 관련 State
    const { isExportModalOpen, openExportModal, closeExportModal, exportOptions, setExportOptions, handleSaveImage } = useScheduleExport();
    const exportRef = useRef<HTMLDivElement>(null);
    const [generatedMapUrl, setGeneratedMapUrl] = useState<string | null>(null);
    const [mapVersion, setMapVersion] = useState(0);
    const [exportMode, setExportMode] = useState<'PLAN' | 'DAY'>('PLAN');
    const [exportSections, setExportSections] = useState<ExportSection[]>([]);
    const [dayExportData, setDayExportData] = useState<{ title: string; subTitle: string; memo: string; schedules: DayScheduleResponse[] } | null>(null);

    // 헤더 상태
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

    const geocodingLibrary = useMapsLibrary("geocoding");
    const geocoder = useMemo(
        () => geocodingLibrary ? new geocodingLibrary.Geocoder() : null,
        [geocodingLibrary]
    );

    const [dirtyMap, setDirtyMap] = useState<Record<string | number, boolean>>({});
    const isAnyDirty = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);

    const blocker = useBlocker(({ currentLocation, nextLocation }) => isAnyDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (blocker.state === "blocked") {
            if (window.confirm("저장되지 않은 변경사항이 있습니다.\n정말 이동하시겠습니까?")) {
                setDirtyMap({});
                setTimeout(() => blocker.proceed(), 0);
            } else blocker.reset();
        }
    }, [blocker]);

    useEffect(() => {
        setMapSchedulesMap({});
        setDayOrderMap({});
        setVisibleDays(new Set());
        setGeneratedMapUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
        setDirtyMap({});
        setMobileViewMode('LIST');
        setIsHeaderExpanded(false);
    }, [planId]);

    const handleSetDirty = useCallback((itemId: string | number, isDirty: boolean) => {
        setDirtyMap(prev => (prev[itemId] === isDirty ? prev : { ...prev, [itemId]: isDirty }));
    }, []);
    const handleHeaderDirty = useCallback((isDirty: boolean) => { handleSetDirty('header', isDirty); }, [handleSetDirty]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    const fetchPlanDetail = useCallback(() => {
        setLoading(true);
        getPlanDetail(planId).then(data => {
            setPlan(data);
            const map: Record<number, number> = {};
            data.days.forEach(d => { map[d.id] = d.dayOrder; });
            setDayOrderMap(map);
        }).finally(() => setLoading(false));
    }, [planId]);
    useEffect(() => { if (planId) fetchPlanDetail(); }, [planId, fetchPlanDetail]);

    const handlePlanExportClick = async () => {
        if (!plan || !plan.days) return;
        const btn = document.getElementById('save-btn');
        const originalText = btn?.innerText;
        if(btn) btn.innerText = "⏳ 생성 중...";

        try {
            const missingDayIds = plan.days.filter(day => !mapSchedulesMap[day.id]).map(day => day.id);
            const newSchedulesMap = { ...mapSchedulesMap };
            if (missingDayIds.length > 0) {
                const results = await Promise.all(missingDayIds.map((id: number) => getSchedulesByDay(id)));
                missingDayIds.forEach((id: number, idx: number) => { newSchedulesMap[id] = recalculateSchedules(results[idx]); });
                setMapSchedulesMap(newSchedulesMap);
            }

            const sortedDays = [...plan.days].sort((a, b) => a.dayOrder - b.dayOrder);
            const sections: ExportSection[] = sortedDays.map(day => ({
                id: day.id,
                title: `${day.dayOrder}일차`,
                memo: day.memo || "",
                schedules: newSchedulesMap[day.id] || []
            }));

            if (!sections.some(s => s.schedules.length > 0)) {
                alert("저장할 일정이 없습니다.");
                if(btn && originalText) btn.innerText = originalText;
                return;
            }

            setExportMode('PLAN');
            setExportSections(sections);
            openExportModal();

        } catch (e) { console.error(e); alert("일정 로딩 실패"); } finally { if(btn && originalText) btn.innerText = originalText; }
    };

    const handlePlanDataExport = async () => {
        if (!plan) return;
        try {
            const transfer = await exportPlanData(plan.id);
            const blob = new Blob(
                [JSON.stringify(transfer, null, 2)],
                { type: "application/json;charset=utf-8" }
            );
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const safeName = plan.planName.replace(/[\\/:*?"<>|]/g, "_").trim() || "여행계획";
            link.href = url;
            link.download = `${safeName}.yume.json`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : "계획을 내보내지 못했습니다.");
        }
    };

    const handleDayExportClick = async (dayId: number) => {
        const dayItem = plan?.days.find(d => d.id === dayId);
        if (!dayItem) return;

        try {
            let schedules = mapSchedulesMap[dayId];
            if (!schedules) {
                const raw = await getSchedulesByDay(dayId);
                schedules = recalculateSchedules(raw);
                setMapSchedulesMap(prev => ({...prev, [dayId]: schedules}));
            }

            setExportMode('DAY');
            setDayExportData({
                title: dayItem.dayName || `Day ${dayItem.dayOrder}`,
                subTitle: `${plan?.planName || '여행'} • ${dayItem.dayOrder}일차`,
                memo: dayItem.memo || "",
                schedules: schedules
            });
            openExportModal();

        } catch (e) { console.error(e); alert("일정 로딩 실패"); }
    };

    const onModalConfirm = async (mapState?: { center: { lat: number, lng: number }, zoom: number }) => {
        const targetSchedules = exportMode === 'PLAN' ? exportSections.flatMap(s => s.schedules) : dayExportData?.schedules || [];
        const query = getStaticMapQuery(targetSchedules, mapState);

        if (query) {
            try {
                const blobUrl = await makeStaticGoogleMap(query);
                setGeneratedMapUrl(prev => { if(prev) URL.revokeObjectURL(prev); return blobUrl; });
                setMapVersion(v => v + 1);
            } catch(e) { console.error(e); alert("지도 생성 실패"); return; }
        }

        const filename = exportMode === 'PLAN' ? plan?.planName || "여행_전체일정" : dayExportData?.title || "여행_일정";
        requestAnimationFrame(() => handleSaveImage(filename, exportRef.current));
    };

    const handleToggleMapVisibility = async (dayId: number) => {
        if (!mapSchedulesMap[dayId]) {
            try {
                const raw = await getSchedulesByDay(dayId);
                const calculated = recalculateSchedules(raw);
                setMapSchedulesMap(prev => ({ ...prev, [dayId]: calculated }));
            } catch { return alert("일정을 불러오지 못했습니다."); }
        }
        setVisibleDays(prev => {
            const next = new Set(prev);
            if (next.has(dayId)) next.delete(dayId);
            else next.add(dayId);
            return next;
        });
    };

    const handleDayToggle = async (dayId: number, dayOrder: number, isOpen: boolean) => {
        if (!isOpen) return;
        if (!mapSchedulesMap[dayId]) {
            try {
                const raw = await getSchedulesByDay(dayId);
                const calculated = recalculateSchedules(raw);
                setMapSchedulesMap(prev => ({ ...prev, [dayId]: calculated }));
                setDayOrderMap(prev => ({ ...prev, [dayId]: dayOrder }));
            } catch (error) {
                console.error("일차 일정을 불러오지 못했습니다.", error);
            }
        }
    };

    const handleSchedulesChange = useCallback((dayId: number, newSchedules: DayScheduleResponse[]) => {
        setMapSchedulesMap(prev => ({ ...prev, [dayId]: newSchedules }));
    }, []);

    const handleCreateNew = async (dayOrder: number, scheduleMode: ScheduleMode) => {
        try {
            const newDay = await createDayInPlan(planId, dayOrder, `${dayOrder}일차`, scheduleMode);

            setPlan(prev => {
                if (!prev) return null;
                // days 배열에 새 일차를 추가하고 정렬
                const updatedDays = [...prev.days, newDay].sort((a, b) => a.dayOrder - b.dayOrder);
                return { ...prev, days: updatedDays };
            });
        } catch {
            alert("일차 생성 실패");
        }
    };
    const handleImportSelect = async (target: number, source: number) => {
        try {
            await swapPlanDay({ sourceDayId: source, targetPlanId: planId, targetDayOrder: target, swapMode: 'REPLACE' });

            // 데이터 정합성을 위해 이 부분은 전체 로드가 필요할 수 있으나,
            // 깜빡임을 줄이려면 fetchPlanDetail을 호출하되 loading 상태를 true로 만들지 않고 배경에서 실행하는 것이 좋습니다.
            const updatedPlan = await getPlanDetail(planId);
            setPlan(updatedPlan);
            // ❌ fetchPlanDetail(); 제거 (setLoading(true)가 포함된 함수이므로)
        } catch {
            alert("가져오기 실패");
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const targetItem = fullDays.find(d => d.id === over.id);
        if (!targetItem) return;

        try {
            // 서버에 순서 변경 요청
            await swapPlanDay({ sourceDayId: Number(active.id), targetPlanId: planId, targetDayOrder: targetItem.dayOrder, swapMode: 'SWAP' });

            // 💡 중요: fetchPlanDetail() 대신 UI에서 먼저 순서를 바꾸는 '낙관적 업데이트' 적용 가능
            const updatedPlan = await getPlanDetail(planId);
            setPlan(updatedPlan);
        } catch {
            alert("순서 변경 실패");
        }
    };

    const handleMapClick = useCallback(async (e: MapMouseEvent) => {
        if (!pickingTarget || !geocoder) return;
        if (e.domEvent) e.domEvent.stopPropagation();
        const processSpotData = (spotReq: SpotCreateRequest) => { setTempSelectedSpot(spotReq); };

        try {
        if (e.detail?.placeId) {
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
            return;
        }

        const clickedLocation = e.detail?.latLng;
        if (!clickedLocation) return;
        const { results } = await geocoder.geocode({ location: clickedLocation });
        const result = results[0];
        const lat = clickedLocation.lat;
        const lng = clickedLocation.lng;
        processSpotData({
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
            alert("선택한 위치의 장소 정보를 불러오지 못했습니다.");
        }
    }, [pickingTarget, geocoder]);

    const handleConfirmRegister = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { dayId, scheduleId } = pickingTarget;
        try {
            const savedSpot = await createSpot(tempSelectedSpot);
            const updatedSchedules = await updateScheduleApi(scheduleId, {
                spotUserId: savedSpot.id,
                spotName: savedSpot.displayName?.trim() || savedSpot.spotName,
                spotType: savedSpot.spotType,
                lat: savedSpot.lat,
                lng: savedSpot.lng,
            });
            setMapSchedulesMap(prev => ({ ...prev, [dayId]: updatedSchedules }));
            setScheduleRefreshVersions(prev => ({ ...prev, [dayId]: (prev[dayId] || 0) + 1 }));
            setTempSelectedSpot(null);
            setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
            alert("내 장소에 등록하고 일정에 선택했습니다.");
        } catch (error) {
            alert(error instanceof Error ? error.message : "장소 등록 실패");
        }
    };

    const handleConfirmScheduleOnly = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { dayId, scheduleId } = pickingTarget;
        try {
            const updatedSchedules = await updateScheduleApi(scheduleId, {
                spotUserId: 0,
                spotName: tempSelectedSpot.spotName,
                spotType: tempSelectedSpot.spotType,
                lat: tempSelectedSpot.lat,
                lng: tempSelectedSpot.lng,
            });
            setMapSchedulesMap(prev => ({ ...prev, [dayId]: updatedSchedules }));
            setScheduleRefreshVersions(prev => ({ ...prev, [dayId]: (prev[dayId] || 0) + 1 }));
            setTempSelectedSpot(null);
            setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
        } catch {
            alert("일정에 장소를 추가하지 못했습니다.");
        }
    };

    const toggleMapViewMode = () => {
        if (mapViewMode === 'ALL') setMapViewMode('PINS');
        else if (mapViewMode === 'PINS') setMapViewMode('NONE');
        else setMapViewMode('ALL');
    };

    const getMapViewModeLabel = () => {
        switch(mapViewMode) {
            case 'ALL': return '🗺️ 핀+경로';
            case 'PINS': return '📍 핀만 보기';
            case 'NONE': return '🙈 지도 숨김';
        }
    };

    const handleDayInfoUpdate = (dayId: number, newName: string, newMemo: string) => {
        setPlan(prev => {
            if (!prev) return null;
            return {
                ...prev,
                days: prev.days.map(day => day.id === dayId ? { ...day, dayName: newName, memo: newMemo } : day)
            };
        });
    };

    const fullDays = useMemo(() => {
        if (!plan) return [];
        return Array.from({ length: plan.planDays }, (_, i) => {
            const dayOrder = i + 1;
            const existingDay = plan.days.find(d => d.dayOrder === dayOrder);
            return { id: existingDay ? existingDay.id : `empty-${dayOrder}`, dayOrder, data: existingDay };
        });
    }, [plan]);

    if (loading || !plan) return <div className="text-center py-20">로딩 중...</div>;

    return (
        <>
            <style>{scrollbarHideStyle}</style>

            <div style={{ position: "fixed", top: 0, left: "-9999px" }}>
                <div ref={exportRef}>
                    {exportMode === 'PLAN' ? (
                        <PlanScheduleExportView
                            key={`plan-export-${planId}-${mapVersion}`}
                            planTitle={plan.planName}
                            planMemo={plan.planMemo || ""}
                            sections={exportSections}
                            options={exportOptions}
                            mapUrl={generatedMapUrl}
                        />
                    ) : (
                        dayExportData && (
                            <DayScheduleExportView
                                key={`day-export-${dayExportData.title}-${mapVersion}`}
                                dayName={dayExportData.title}
                                subTitle={dayExportData.subTitle}
                                memo={dayExportData.memo}
                                schedules={dayExportData.schedules}
                                options={exportOptions}
                                mapUrl={generatedMapUrl}
                            />
                        )
                    )}
                </div>
            </div>

            <ImageExportModal
                isOpen={isExportModalOpen}
                onClose={closeExportModal}
                onConfirm={onModalConfirm}
                options={exportOptions}
                setOptions={setExportOptions}
                schedules={exportMode === 'PLAN' ? exportSections.flatMap(s => s.schedules) : dayExportData?.schedules || []}
            />

            <div className="flex flex-col h-full w-full relative overflow-hidden bg-white">
                <div className="flex w-full h-full relative">
                    <div className={`absolute inset-0 z-20 bg-gray-50 transition-transform duration-300 md:relative md:w-1/2 md:translate-x-0 md:z-auto ${mobileViewMode === 'MAP' ? 'translate-x-0' : '-translate-x-full'}`}>
                        <div className="absolute top-4 right-4 z-50 flex gap-2">
                            <button onClick={toggleMapViewMode} className={`px-4 py-2 rounded-full text-xs font-bold shadow-md transition border bg-white text-blue-600 border-blue-200 hover:bg-blue-50`}>{getMapViewModeLabel()}</button>
                        </div>
                        {pickingTarget && (
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg border-2 border-white cursor-pointer hover:bg-green-700 transition" onClick={() => { setPickingTarget(null); setTempSelectedSpot(null); }}>
                                <span className="font-bold text-sm">📍 지도에서 위치를 클릭하세요!</span><span className="bg-white/20 px-2 py-0.5 rounded text-xs">취소 X</span>
                            </div>
                        )}
                        <Map defaultCenter={{ lat: 34.9858, lng: 135.7588 }} defaultZoom={13} mapId="DEMO_MAP_ID" disableDefaultUI={true} className="w-full h-full" onClick={handleMapClick} gestureHandling="auto">
                            <MapDirections daySchedulesMap={mapSchedulesMap} dayOrderMap={dayOrderMap} mapViewMode={mapViewMode} visibleDays={visibleDays} />
                            {mapViewMode !== 'NONE' && Object.entries(mapSchedulesMap).flatMap(([dayIdStr, schedules]) => {
                                const dayId = Number(dayIdStr);
                                if (!visibleDays.has(dayId)) return [];
                                const color = getDayColor(dayOrderMap[dayId] || 1);
                                return (schedules || []).map((schedule, index) => {
                                    if (!schedule) return null;
                                    const lat = Number(schedule.lat);
                                    const lng = Number(schedule.lng);
                                    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null;
                                    return <AdvancedMarker key={schedule.id} position={{ lat, lng }} onClick={() => setSelectedScheduleId(schedule.id)} zIndex={selectedScheduleId === schedule.id ? 100 : 10}><NumberedMarker number={index + 1} color={color} /></AdvancedMarker>;
                                });
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
                            <button
                                onClick={() => setMobileViewMode('LIST')}
                                className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform"
                            >
                                🔙 목록 보기
                            </button>
                        </div>
                    </div>

                    <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
                        {/* 헤더 영역 (모바일 접기/펼치기 적용) */}
                        <div className={`relative bg-white z-30 flex-shrink-0 border-b border-gray-100 transition-all duration-300 ease-in-out ${!isHeaderExpanded ? 'max-h-[190px] overflow-hidden' : ''} md:max-h-none md:overflow-visible`}>
                            <div className="px-5 py-4 pb-8">
                                <PlanHeader
                                    plan={plan}
                                    onRefresh={fetchPlanDetail}
                                    onDirtyChange={handleHeaderDirty}
                                />
                            </div>
                            <div className="md:hidden absolute bottom-0 left-0 w-full h-10 flex justify-center items-end pb-2 bg-gradient-to-t from-white via-white/90 to-transparent">
                                <button onClick={() => setIsHeaderExpanded(!isHeaderExpanded)} className="text-[10px] font-bold text-gray-400 bg-white hover:bg-gray-50 px-3 py-1 rounded-full border border-gray-200 shadow-sm flex items-center gap-1 active:scale-95 transition-transform">{isHeaderExpanded ? '접기 ▲' : '상세 정보 ▼'}</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide">
                            <div className="flex items-center justify-between mb-4 px-1">
                                <h2 className="text-xl font-bold text-gray-800">상세 일정</h2>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowInjury(!showInjury)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border shadow-sm ${showInjury ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        ⚽ {showInjury ? '인저리 ON' : 'OFF'}
                                    </button>
                                    <button
                                        id="save-btn"
                                        onClick={handlePlanExportClick}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition border shadow-sm bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    >
                                        📸 전체 저장
                                    </button>
                                    <button
                                        onClick={handlePlanDataExport}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition border shadow-sm bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    >
                                        💾 JSON
                                    </button>
                                </div>
                            </div>

                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={fullDays.map(d => d.id)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-4">
                                        {fullDays.map(item => (
                                            item.data ? (
                                                <PlanDayItem
                                                    key={item.id} id={item.id} dayOrder={item.dayOrder} data={item.data}
                                                    routeDate={getPlanDayDate(plan.planStartDate, item.dayOrder)}
                                                    showInjury={showInjury}
                                                    onSchedulesChange={handleSchedulesChange}
                                                    refreshVersion={scheduleRefreshVersions[item.data.id] || 0}
                                                    onRefresh={fetchPlanDetail}
                                                    onUpdateDayInfo={handleDayInfoUpdate}
                                                    setDirty={handleSetDirty} onToggle={handleDayToggle}
                                                    pickingTarget={pickingTarget}
                                                    setPickingTarget={(target) => {
                                                        setPickingTarget(target);
                                                        if (target && window.innerWidth < 768) setMobileViewMode('MAP');
                                                    }}
                                                    onQuickMapPickStart={() => {
                                                        setPickingTarget(null);
                                                        setTempSelectedSpot(null);
                                                        if (window.innerWidth < 768) setMobileViewMode('MAP');
                                                    }}
                                                    isVisibleOnMap={visibleDays.has(item.data.id)}
                                                    onToggleMapVisibility={handleToggleMapVisibility}
                                                    onExportDay={() => handleDayExportClick(item.data!.id)}
                                                />
                                            ) : (
                                                <EmptySlotModeSelector key={item.id} dayOrder={item.dayOrder} onCreateNew={(mode) => handleCreateNew(item.dayOrder, mode)} onImportSelect={(src) => handleImportSelect(item.dayOrder, src)} />
                                            )
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                        <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-full px-6 pointer-events-none">
                            <button onClick={() => setMobileViewMode('MAP')} className="pointer-events-auto mx-auto bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 active:scale-95 transition-transform">
                                🗺️ 지도 보기
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
