import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useBlocker } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, InfoWindow, Pin, type MapMouseEvent } from "@vis.gl/react-google-maps";

// API
import { exportPlanData, getPlanDetail } from "../api/planApi";
import { copyPlanDay, createDayInPlan, swapPlanDay, getIndependentDays } from "../api/dayApi";
import { getSchedulesByDay, getUnlinkedSpotGroups, transferSchedule, updateSchedule as updateScheduleApi, type UnlinkedSpotGroup } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi";
import { applyDayRouteEstimates, auditDayRoute, auditPlanRoutes } from "../api/routeApi";
// ✅ 지도 생성 API
import { makeStaticGoogleMap } from "../api/mapApi";

// Components
import PlanHeader from "../components/plan/PlanHeader";
import PlanDayItem from "../components/plan/PlanDayItem";
import SpotLinkModal from "../components/plan/SpotLinkModal";
import PlanRouteAuditModal from "../components/plan/PlanRouteAuditModal";
import DayRouteAuditModal from "../components/day/DayRouteAuditModal";

// Types & Utils
import type { PlanDetailResponse } from "../types/plan";
import type { PlanDayResponse, ScheduleMode } from "../types/planDay.ts";
import type { DayScheduleResponse } from "../types/schedule";
import type { SpotCreateRequest } from "../types/spot";
import type { DayRouteAuditLeg, DayRouteAuditResponse, PlanRouteAuditResponse } from "../types/route";

// ✅ Export 관련 컴포넌트
import {
    ImageExportModal,
    PlanScheduleExportView,
    DayScheduleExportView
} from "../components/common/ScheduleExport";
import { useScheduleExport } from "../components/common/useScheduleExport";
import { getStaticMapQuery, type ExportSection } from "../components/common/scheduleExportUtils";
import { useFeedback } from "../components/common/useFeedback";
import { drawAuditedRouteLeg } from "../utils/mapRoutePolylines";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const scrollbarHideStyle = `.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;

type PlanWorkspacePreferences = {
    mapViewMode: 'ALL' | 'PINS' | 'NONE';
    showInjury: boolean;
    visibleDayIds: number[];
    expandedDayIds: number[];
};

type PlanSearchResult = {
    key: string;
    dayId: number;
    dayOrder: number;
    dayName: string;
    scheduleId?: number;
    title: string;
    detail: string;
};

const defaultPlanWorkspacePreferences: PlanWorkspacePreferences = {
    mapViewMode: 'ALL',
    showInjury: false,
    visibleDayIds: [],
    expandedDayIds: [],
};

const planWorkspaceStorageKey = (planId: number) => `yume:plan-workspace:${planId}`;

const readPlanWorkspacePreferences = (planId: number): PlanWorkspacePreferences => {
    try {
        const raw = localStorage.getItem(planWorkspaceStorageKey(planId));
        if (!raw) return defaultPlanWorkspacePreferences;
        const saved = JSON.parse(raw) as Partial<PlanWorkspacePreferences>;
        return {
            mapViewMode: saved.mapViewMode === 'PINS' || saved.mapViewMode === 'NONE' ? saved.mapViewMode : 'ALL',
            showInjury: saved.showInjury === true,
            visibleDayIds: Array.isArray(saved.visibleDayIds) ? saved.visibleDayIds.filter(Number.isInteger) : [],
            expandedDayIds: Array.isArray(saved.expandedDayIds) ? saved.expandedDayIds.filter(Number.isInteger) : [],
        };
    } catch {
        return defaultPlanWorkspacePreferences;
    }
};

const sameNumberSet = (left: Set<number>, right: Set<number>) =>
    left.size === right.size && [...left].every(value => right.has(value));

const getPlanDayDate = (startDate: string, dayOrder: number) => {
    const [year, month, day] = startDate.split('-').map(Number);
    const date = new Date(year, month - 1, day + dayOrder - 1);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
};

const duplicatedLocalRouteMessages = new Set([
    '출발지 또는 도착지의 위치 정보가 없습니다.',
    '이동수단이 지정되지 않았습니다.',
]);

const countAdditionalRouteIssues = (routeAudit: NonNullable<PlanRouteAuditResponse['days'][number]['routeAudit']>) =>
    routeAudit.legs.filter(leg => leg.status !== 'OK' && !duplicatedLocalRouteMessages.has(leg.message)).length;

const scheduleAuditFingerprint = (schedules: DayScheduleResponse[]) => JSON.stringify(schedules.map(schedule => ({
    id: schedule.id,
    order: schedule.scheduleOrder,
    name: schedule.spotName,
    lat: schedule.lat,
    lng: schedule.lng,
    start: schedule.startTime,
    end: schedule.endTime,
    fixed: schedule.fixedStartTime,
    duration: schedule.duration,
    movingDuration: schedule.movingDuration,
    transportation: schedule.transportation,
})));

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
    auditedDayRoute: { dayId: number; result: DayRouteAuditResponse } | null;
}

function MapDirections({ daySchedulesMap, dayOrderMap, mapViewMode, visibleDays, auditedDayRoute }: MapDirectionsProps) {
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
            if (auditedDayRoute?.dayId === dayId) {
                const scheduleById = new globalThis.Map(schedules.map(schedule => [schedule.id, schedule]));
                auditedDayRoute.result.legs.forEach(leg => {
                    const from = scheduleById.get(leg.fromScheduleId);
                    const to = scheduleById.get(leg.toScheduleId);
                    if (!from || !to) return;
                    const drawing = drawAuditedRouteLeg({ mapsLibrary, map, leg, from, to });
                    if (!drawing) return;
                    if (!drawing.actualRoute) {
                        const connector = new mapsLibrary.Polyline({
                            path: [
                                { lat: Number(from.lat), lng: Number(from.lng) },
                                { lat: Number(to.lat), lng: Number(to.lng) },
                            ],
                            geodesic: true,
                            strokeColor: color,
                            strokeOpacity: 0.8,
                            strokeWeight: 5,
                            zIndex: 10,
                            icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }],
                        });
                        connector.setMap(map);
                        newPolylines.push(connector);
                    }
                    newPolylines.push(...drawing.polylines);
                    drawing.path.forEach(point => bounds.extend(point));
                    hasPoints = true;
                });
                return;
            }

            const path = schedules.map(s => ({
                lat: Number(s.lat),
                lng: Number(s.lng)
            })).filter(pos => !isNaN(pos.lat) && !isNaN(pos.lng) && pos.lat !== 0 && pos.lng !== 0);
            if (path.length > 0) {
                path.forEach(pos => bounds.extend(pos));
                hasPoints = true;
                const polyline = new mapsLibrary.Polyline({
                    path, geodesic: true, strokeColor: color, strokeOpacity: 0.8, strokeWeight: 5, zIndex: 20,
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
    }, [map, mapsLibrary, daySchedulesMap, dayOrderMap, mapViewMode, visibleDays, auditedDayRoute]);
    return null;
}

function EmptySlotModeSelector({ dayOrder, onCreateNew, onImportSelect }: { dayOrder: number, onCreateNew: (scheduleMode: ScheduleMode) => void, onImportSelect: (id: number) => void }) {
    const { showToast } = useFeedback();
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
            showToast({ message: "하루 일정 목록을 불러오지 못했습니다.", type: 'error' });
            setShowImport(false);
        } finally {
            setLoading(false);
        }
    };

    if (!isExpanded) {
        return (
            <button type="button" data-plan-day-order={dayOrder} onClick={() => setIsExpanded(true)} className="mb-3 flex w-full scroll-mt-24 items-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 text-left font-bold text-gray-400 transition hover:border-blue-400 hover:bg-white hover:text-blue-600">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-200 text-lg">+</span>
                Day {dayOrder} 일정 추가하기
            </button>
        );
    }

    return (
        <div data-plan-day-order={dayOrder} className="mb-4 scroll-mt-24 rounded-2xl border-2 border-blue-100 bg-blue-50/60 p-4">
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
    const { confirm, showToast } = useFeedback();
    const { id } = useParams<{ id: string }>();
    const planId = Number(id);
    const [plan, setPlan] = useState<PlanDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [mapSchedulesMap, setMapSchedulesMap] = useState<Record<number, DayScheduleResponse[]>>({});
    const mapSchedulesMapRef = useRef<Record<number, DayScheduleResponse[]>>({});
    const [scheduleRefreshVersions, setScheduleRefreshVersions] = useState<Record<number, number>>({});
    const [dayOrderMap, setDayOrderMap] = useState<Record<number, number>>({});

    const [mapViewMode, setMapViewMode] = useState<'ALL' | 'PINS' | 'NONE'>('ALL');
    const [showInjury, setShowInjury] = useState(false);
    const [visibleDays, setVisibleDays] = useState<Set<number>>(new Set());
    const [expandedDayIds, setExpandedDayIds] = useState<Set<number>>(new Set());
    const [workspaceReadyPlanId, setWorkspaceReadyPlanId] = useState<number | null>(null);
    const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'MAP'>('LIST');
    const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);

    const [pickingTarget, setPickingTarget] = useState<{ dayId: number, scheduleId: number } | null>(null);
    const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);

    // Export 관련 State
    const { isExportModalOpen, openExportModal, closeExportModal, exportOptions, setExportOptions, handleSaveImage } = useScheduleExport();
    const exportRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDetailsElement>(null);
    const [generatedMapUrl, setGeneratedMapUrl] = useState<string | null>(null);
    const [mapVersion, setMapVersion] = useState(0);
    const [exportMode, setExportMode] = useState<'PLAN' | 'DAY'>('PLAN');
    const [exportSections, setExportSections] = useState<ExportSection[]>([]);
    const [dayExportData, setDayExportData] = useState<{ title: string; subTitle: string; memo: string; schedules: DayScheduleResponse[] } | null>(null);
    const [copySourceDay, setCopySourceDay] = useState<PlanDayResponse | null>(null);
    const [copyTarget, setCopyTarget] = useState<string>('INDEPENDENT');
    const [copyName, setCopyName] = useState('');
    const [copyingDay, setCopyingDay] = useState(false);
    const [scheduleTransferSource, setScheduleTransferSource] = useState<{ sourceDay: PlanDayResponse; schedule: DayScheduleResponse } | null>(null);
    const [scheduleTransferTargetDayId, setScheduleTransferTargetDayId] = useState<number | null>(null);
    const [scheduleTransferCopy, setScheduleTransferCopy] = useState(false);
    const [scheduleTransferAtStart, setScheduleTransferAtStart] = useState(false);
    const [scheduleTransferLoading, setScheduleTransferLoading] = useState(false);
    const [spotLinkGroups, setSpotLinkGroups] = useState<UnlinkedSpotGroup[] | null>(null);
    const [spotLinksLoading, setSpotLinksLoading] = useState(false);
    const [planAuditResult, setPlanAuditResult] = useState<PlanRouteAuditResponse | null>(null);
    const [planAuditOpen, setPlanAuditOpen] = useState(false);
    const [planAuditLoading, setPlanAuditLoading] = useState(false);
    const [planAuditCheckedAt, setPlanAuditCheckedAt] = useState<number | null>(null);
    const [planAuditStale, setPlanAuditStale] = useState(false);
    const [planAuditProgress, setPlanAuditProgress] = useState<{ completedLegs: number; totalLegs: number; completedDays: number; totalDays: number } | null>(null);
    const [dayOpenRequest, setDayOpenRequest] = useState<{ dayId: number; key: number } | null>(null);
    const [scheduleFocusRequest, setScheduleFocusRequest] = useState<{ dayId: number; scheduleId: number; key: number; openEditor: boolean } | null>(null);
    const [allDaysOpenRequest, setAllDaysOpenRequest] = useState<{ key: number; expanded: boolean } | null>(null);
    const [showIssueDaysOnly, setShowIssueDaysOnly] = useState(false);
    const [planSearchQuery, setPlanSearchQuery] = useState('');
    const [planSearchLoading, setPlanSearchLoading] = useState(false);
    const [planSearchError, setPlanSearchError] = useState('');
    const searchLoadPromiseRef = useRef<Promise<void> | null>(null);
    const [dayRouteAudit, setDayRouteAudit] = useState<{
        dayId: number;
        dayName: string;
        result: DayRouteAuditResponse;
        checkedAt: number;
        fingerprint: string;
    } | null>(null);
    const [dayRouteAuditOpen, setDayRouteAuditOpen] = useState(false);
    const [dayRouteAuditLoadingId, setDayRouteAuditLoadingId] = useState<number | null>(null);
    const [dayRouteApplyLoading, setDayRouteApplyLoading] = useState(false);
    const planAuditAbortRef = useRef<AbortController | null>(null);
    const hasPlanAuditResultRef = useRef(false);
    const planAuditResultRef = useRef<PlanRouteAuditResponse | null>(null);

    // 헤더 상태
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

    const geocodingLibrary = useMapsLibrary("geocoding");
    const geocoder = useMemo(
        () => geocodingLibrary ? new geocodingLibrary.Geocoder() : null,
        [geocodingLibrary]
    );

    const [dirtyMap, setDirtyMap] = useState<Record<string | number, boolean>>({});
    const isAnyDirty = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);
    const blockerPromptActiveRef = useRef(false);

    const blocker = useBlocker(({ currentLocation, nextLocation }) => isAnyDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (!isAnyDirty) return;

        const preventUnsavedReload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', preventUnsavedReload);
        return () => window.removeEventListener('beforeunload', preventUnsavedReload);
    }, [isAnyDirty]);

    useEffect(() => {
        if (blocker.state === "blocked" && !blockerPromptActiveRef.current) {
            blockerPromptActiveRef.current = true;
            void confirm({
                title: '저장되지 않은 변경사항',
                message: '저장되지 않은 변경사항이 있습니다. 저장하지 않고 이동할까요?',
                confirmLabel: '저장하지 않고 이동',
                danger: true,
            }).then(shouldProceed => {
                if (shouldProceed) {
                    setDirtyMap({});
                    setTimeout(() => blocker.proceed(), 0);
                } else blocker.reset();
                blockerPromptActiveRef.current = false;
            });
        }
    }, [blocker, confirm]);

    useEffect(() => {
        const preferences = readPlanWorkspacePreferences(planId);
        setWorkspaceReadyPlanId(null);
        setMapSchedulesMap({});
        mapSchedulesMapRef.current = {};
        setDayOrderMap({});
        setMapViewMode(preferences.mapViewMode);
        setShowInjury(preferences.showInjury);
        setVisibleDays(new Set(preferences.visibleDayIds));
        setExpandedDayIds(new Set(preferences.expandedDayIds));
        setGeneratedMapUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
        setDirtyMap({});
        setMobileViewMode('LIST');
        setIsHeaderExpanded(false);
        setPlanAuditResult(null);
        hasPlanAuditResultRef.current = false;
        planAuditResultRef.current = null;
        setPlanAuditOpen(false);
        setPlanAuditCheckedAt(null);
        setPlanAuditStale(false);
        setPlanAuditProgress(null);
        setDayRouteAudit(null);
        setDayRouteAuditOpen(false);
        setDayRouteAuditLoadingId(null);
        setDayRouteApplyLoading(false);
        setScheduleFocusRequest(null);
        setScheduleTransferSource(null);
        setScheduleTransferTargetDayId(null);
        setScheduleTransferLoading(false);
        setAllDaysOpenRequest(null);
        setShowIssueDaysOnly(false);
        setPlanSearchQuery('');
        setPlanSearchLoading(false);
        setPlanSearchError('');
        searchLoadPromiseRef.current = null;
        planAuditAbortRef.current?.abort();
        planAuditAbortRef.current = null;
        setWorkspaceReadyPlanId(planId);
    }, [planId]);

    useEffect(() => {
        if (workspaceReadyPlanId !== planId) return;
        const preferences: PlanWorkspacePreferences = {
            mapViewMode,
            showInjury,
            visibleDayIds: [...visibleDays],
            expandedDayIds: [...expandedDayIds],
        };
        try {
            localStorage.setItem(planWorkspaceStorageKey(planId), JSON.stringify(preferences));
        } catch {
            // 저장 공간을 사용할 수 없는 브라우저에서도 화면 동작은 유지한다.
        }
    }, [expandedDayIds, mapViewMode, planId, showInjury, visibleDays, workspaceReadyPlanId]);

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
    useEffect(() => { mapSchedulesMapRef.current = mapSchedulesMap; }, [mapSchedulesMap]);
    useEffect(() => { planAuditResultRef.current = planAuditResult; }, [planAuditResult]);
    useEffect(() => { if (planId) fetchPlanDetail(); }, [planId, fetchPlanDetail]);
    useEffect(() => () => planAuditAbortRef.current?.abort(), []);

    useEffect(() => {
        if (!plan || workspaceReadyPlanId !== planId) return;
        const validDayIds = new Set(plan.days.map(day => day.id));
        setVisibleDays(previous => {
            const next = new Set([...previous].filter(dayId => validDayIds.has(dayId)));
            return sameNumberSet(previous, next) ? previous : next;
        });
        setExpandedDayIds(previous => {
            const next = new Set([...previous].filter(dayId => validDayIds.has(dayId)));
            return sameNumberSet(previous, next) ? previous : next;
        });
    }, [plan, planId, workspaceReadyPlanId]);

    useEffect(() => {
        if (!plan || workspaceReadyPlanId !== planId) return;
        const validDayIds = new Set(plan.days.map(day => day.id));
        const missingDayIds = [...visibleDays].filter(dayId => validDayIds.has(dayId) && !mapSchedulesMapRef.current[dayId]);
        if (missingDayIds.length === 0) return;

        let cancelled = false;
        void Promise.all(missingDayIds.map(async dayId => ({ dayId, schedules: await getSchedulesByDay(dayId) })))
            .then(results => {
                if (cancelled) return;
                const next = { ...mapSchedulesMapRef.current };
                results.forEach(({ dayId, schedules }) => { next[dayId] = schedules; });
                mapSchedulesMapRef.current = next;
                setMapSchedulesMap(next);
            })
            .catch(error => console.error('저장된 지도 표시 일정을 복원하지 못했습니다.', error));
        return () => { cancelled = true; };
    }, [plan, planId, visibleDays, workspaceReadyPlanId]);

    const dayRouteAuditStale = dayRouteAudit != null
        && mapSchedulesMap[dayRouteAudit.dayId] != null
        && scheduleAuditFingerprint(mapSchedulesMap[dayRouteAudit.dayId]) !== dayRouteAudit.fingerprint;

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
                missingDayIds.forEach((id: number, idx: number) => { newSchedulesMap[id] = results[idx]; });
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
                showToast({ message: "저장할 일정이 없습니다.", type: 'info' });
                if(btn && originalText) btn.innerText = originalText;
                return;
            }

            setExportMode('PLAN');
            setExportSections(sections);
            openExportModal();

        } catch (e) { console.error(e); showToast({ message: "일정을 불러오지 못했습니다.", type: 'error' }); } finally { if(btn && originalText) btn.innerText = originalText; }
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
            showToast({ message: error instanceof Error ? error.message : "계획을 내보내지 못했습니다.", type: 'error' });
        }
    };

    const handleDayExportClick = async (dayId: number) => {
        const dayItem = plan?.days.find(d => d.id === dayId);
        if (!dayItem) return;

        try {
            let schedules = mapSchedulesMap[dayId];
            if (!schedules) {
                const raw = await getSchedulesByDay(dayId);
                schedules = raw;
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

        } catch (e) { console.error(e); showToast({ message: "일정을 불러오지 못했습니다.", type: 'error' }); }
    };

    const onModalConfirm = async (mapState?: { center: { lat: number, lng: number }, zoom: number }) => {
        const targetSchedules = exportMode === 'PLAN' ? exportSections.flatMap(s => s.schedules) : dayExportData?.schedules || [];
        const query = getStaticMapQuery(targetSchedules, mapState);

        if (query) {
            try {
                const blobUrl = await makeStaticGoogleMap(query);
                setGeneratedMapUrl(prev => { if(prev) URL.revokeObjectURL(prev); return blobUrl; });
                setMapVersion(v => v + 1);
            } catch(e) { console.error(e); showToast({ message: "내보내기용 지도를 만들지 못했습니다.", type: 'error' }); return; }
        }

        const filename = exportMode === 'PLAN' ? plan?.planName || "여행_전체일정" : dayExportData?.title || "여행_일정";
        requestAnimationFrame(() => handleSaveImage(filename, exportRef.current));
    };

    const handleToggleMapVisibility = async (dayId: number) => {
        if (!mapSchedulesMap[dayId]) {
            try {
                const raw = await getSchedulesByDay(dayId);
                setMapSchedulesMap(prev => ({ ...prev, [dayId]: raw }));
            } catch { return showToast({ message: "일정을 불러오지 못했습니다.", type: 'error' }); }
        }
        setVisibleDays(prev => {
            const next = new Set(prev);
            if (next.has(dayId)) next.delete(dayId);
            else next.add(dayId);
            return next;
        });
    };

    const handleDayToggle = useCallback(async (dayId: number, dayOrder: number, isOpen: boolean) => {
        setExpandedDayIds(previous => {
            const next = new Set(previous);
            if (isOpen) next.add(dayId);
            else next.delete(dayId);
            return sameNumberSet(previous, next) ? previous : next;
        });
        if (!isOpen) return;
        if (!mapSchedulesMapRef.current[dayId]) {
            try {
                const raw = await getSchedulesByDay(dayId);
                setMapSchedulesMap(prev => ({ ...prev, [dayId]: raw }));
                setDayOrderMap(prev => ({ ...prev, [dayId]: dayOrder }));
            } catch (error) {
                console.error("일차 일정을 불러오지 못했습니다.", error);
            }
        }
    }, []);

    const markPlanAuditStale = useCallback(() => {
        if (hasPlanAuditResultRef.current) setPlanAuditStale(true);
    }, []);

    const refreshPlanAfterMutation = useCallback(() => {
        markPlanAuditStale();
        fetchPlanDetail();
    }, [fetchPlanDetail, markPlanAuditStale]);

    const handleSchedulesChange = useCallback((dayId: number, newSchedules: DayScheduleResponse[]) => {
        const previous = mapSchedulesMapRef.current[dayId];
        const auditedScheduleCount = planAuditResultRef.current?.days.find(day => day.dayId === dayId)?.scheduleCount;
        const hydratedAfterAudit = previous?.length === 0 && auditedScheduleCount === newSchedules.length;
        if (previous && !hydratedAfterAudit && scheduleAuditFingerprint(previous) !== scheduleAuditFingerprint(newSchedules)) {
            markPlanAuditStale();
        }
        const next = { ...mapSchedulesMapRef.current, [dayId]: newSchedules };
        mapSchedulesMapRef.current = next;
        setMapSchedulesMap(next);
    }, [markPlanAuditStale]);

    const ensureAllPlanSchedulesLoaded = useCallback(async () => {
        if (!plan) return;
        if (searchLoadPromiseRef.current) return searchLoadPromiseRef.current;
        const missingDayIds = plan.days
            .map(day => day.id)
            .filter(dayId => mapSchedulesMapRef.current[dayId] === undefined);
        if (missingDayIds.length === 0) return;

        setPlanSearchLoading(true);
        setPlanSearchError('');
        const loadPromise = Promise.allSettled(
            missingDayIds.map(async dayId => ({ dayId, schedules: await getSchedulesByDay(dayId) })),
        ).then(results => {
            const next = { ...mapSchedulesMapRef.current };
            let failed = false;
            results.forEach(result => {
                if (result.status === 'fulfilled') next[result.value.dayId] = result.value.schedules;
                else failed = true;
            });
            mapSchedulesMapRef.current = next;
            setMapSchedulesMap(next);
            if (failed) setPlanSearchError('일부 일정을 불러오지 못했습니다. 다시 검색해 주세요.');
        }).finally(() => {
            searchLoadPromiseRef.current = null;
            setPlanSearchLoading(false);
        });
        searchLoadPromiseRef.current = loadPromise;
        return loadPromise;
    }, [plan]);

    useEffect(() => {
        if (planSearchQuery.trim().length < 2) return;
        const timer = window.setTimeout(() => { void ensureAllPlanSchedulesLoaded(); }, 250);
        return () => window.clearTimeout(timer);
    }, [ensureAllPlanSchedulesLoaded, planSearchQuery]);

    const handleCreateNew = async (dayOrder: number, scheduleMode: ScheduleMode) => {
        try {
            const newDay = await createDayInPlan(planId, dayOrder, `${dayOrder}일차`, scheduleMode);

            setPlan(prev => {
                if (!prev) return null;
                // days 배열에 새 일차를 추가하고 정렬
                const updatedDays = [...prev.days, newDay].sort((a, b) => a.dayOrder - b.dayOrder);
                return { ...prev, days: updatedDays };
            });
            markPlanAuditStale();
            showToast({ message: `${dayOrder}일차 일정을 만들었습니다.`, type: 'success' });
        } catch {
            showToast({ message: "일차 일정을 만들지 못했습니다.", type: 'error' });
        }
    };
    const handleImportSelect = async (target: number, source: number) => {
        try {
            await swapPlanDay({ sourceDayId: source, targetPlanId: planId, targetDayOrder: target, swapMode: 'REPLACE' });

            // 데이터 정합성을 위해 이 부분은 전체 로드가 필요할 수 있으나,
            // 깜빡임을 줄이려면 fetchPlanDetail을 호출하되 loading 상태를 true로 만들지 않고 배경에서 실행하는 것이 좋습니다.
            const updatedPlan = await getPlanDetail(planId);
            setPlan(updatedPlan);
            markPlanAuditStale();
            // ❌ fetchPlanDetail(); 제거 (setLoading(true)가 포함된 함수이므로)
            showToast({ message: `${target}일차에 하루 일정을 가져왔습니다.`, type: 'success' });
        } catch {
            showToast({ message: "하루 일정을 가져오지 못했습니다.", type: 'error' });
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
            markPlanAuditStale();
        } catch {
            showToast({ message: "일차 순서를 변경하지 못했습니다.", type: 'error' });
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
            showToast({ message: "선택한 위치의 장소 정보를 불러오지 못했습니다.", type: 'error' });
        }
    }, [pickingTarget, geocoder, showToast]);

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
            markPlanAuditStale();
            setTempSelectedSpot(null);
            setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
            showToast({ message: "내 장소에 등록하고 일정에 선택했습니다.", type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : "장소를 등록하지 못했습니다.", type: 'error' });
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
            markPlanAuditStale();
            setTempSelectedSpot(null);
            setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
        } catch {
            showToast({ message: "일정에 장소를 추가하지 못했습니다.", type: 'error' });
        }
    };

    const toggleMapViewMode = () => {
        if (mapViewMode === 'ALL') setMapViewMode('PINS');
        else if (mapViewMode === 'PINS') setMapViewMode('NONE');
        else setMapViewMode('ALL');
    };

    const getMapViewModeLabel = () => {
        switch(mapViewMode) {
            case 'ALL': return '🗺️ 지도: 핀+경로';
            case 'PINS': return '📍 지도: 핀만';
            case 'NONE': return '🙈 지도: 숨김';
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
        markPlanAuditStale();
    };

    const fullDays = useMemo(() => {
        if (!plan) return [];
        return Array.from({ length: plan.planDays }, (_, i) => {
            const dayOrder = i + 1;
            const existingDay = plan.days.find(d => d.dayOrder === dayOrder);
            return { id: existingDay ? existingDay.id : `empty-${dayOrder}`, dayOrder, data: existingDay };
        });
    }, [plan]);

    const issueDayOrders = useMemo(
        () => new Set((planAuditResult?.days || []).filter(day => day.issueCount > 0).map(day => day.dayOrder)),
        [planAuditResult],
    );
    const displayedFullDays = useMemo(
        () => showIssueDaysOnly ? fullDays.filter(day => issueDayOrders.has(day.dayOrder)) : fullDays,
        [fullDays, issueDayOrders, showIssueDaysOnly],
    );
    const planSearchResults = useMemo<PlanSearchResult[]>(() => {
        const query = planSearchQuery.trim().toLocaleLowerCase();
        if (!plan || query.length < 2) return [];

        const results: PlanSearchResult[] = [];
        [...plan.days].sort((left, right) => left.dayOrder - right.dayOrder).forEach(day => {
            const dayText = `${day.dayName || ''} ${day.memo || ''}`.toLocaleLowerCase();
            if (dayText.includes(query)) {
                results.push({
                    key: `day-${day.id}`,
                    dayId: day.id,
                    dayOrder: day.dayOrder,
                    dayName: day.dayName,
                    title: day.dayName,
                    detail: day.memo || '일차 전체 열기',
                });
            }

            (mapSchedulesMap[day.id] || []).forEach(schedule => {
                const searchable = [schedule.spotName, schedule.memo, schedule.movingMemo]
                    .filter((value): value is string => Boolean(value))
                    .join(' ')
                    .toLocaleLowerCase();
                if (!searchable.includes(query)) return;
                results.push({
                    key: `schedule-${schedule.id}`,
                    dayId: day.id,
                    dayOrder: day.dayOrder,
                    dayName: day.dayName,
                    scheduleId: schedule.id,
                    title: schedule.spotName || '장소명 없음',
                    detail: [schedule.memo, schedule.movingMemo].filter(Boolean).join(' · ') || '세부일정 열기',
                });
            });
        });
        return results.slice(0, 40);
    }, [mapSchedulesMap, plan, planSearchQuery]);

    const jumpToDay = (item: (typeof fullDays)[number]) => {
        setMobileViewMode('LIST');
        if (showIssueDaysOnly && !issueDayOrders.has(item.dayOrder)) setShowIssueDaysOnly(false);
        if (item.data) {
            setDayOpenRequest(previous => ({ dayId: item.data!.id, key: (previous?.key ?? 0) + 1 }));
        }
        window.setTimeout(() => {
            document.querySelector(`[data-plan-day-order="${item.dayOrder}"]`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }, 100);
    };

    const setAllDaysExpanded = (expanded: boolean) => {
        setExpandedDayIds(expanded ? new Set(plan?.days.map(day => day.id) || []) : new Set());
        setAllDaysOpenRequest(previous => ({ key: (previous?.key ?? 0) + 1, expanded }));
    };

    const resetWorkspaceView = () => {
        setMapViewMode('ALL');
        setShowInjury(false);
        setVisibleDays(new Set());
        setExpandedDayIds(new Set());
        setShowIssueDaysOnly(false);
        setAllDaysOpenRequest(previous => ({ key: (previous?.key ?? 0) + 1, expanded: false }));
        showToast({ message: '화면 표시 설정을 초기화했습니다.', type: 'info' });
    };

    const openPlanDay = (dayId: number, scheduleId?: number, openEditor = true) => {
        setPlanAuditOpen(false);
        setMobileViewMode('LIST');
        setShowIssueDaysOnly(false);
        setDayOpenRequest(previous => ({ dayId, key: (previous?.key ?? 0) + 1 }));
        if (scheduleId != null) {
            setSelectedScheduleId(scheduleId);
            setScheduleFocusRequest(previous => ({
                dayId,
                scheduleId,
                key: (previous?.key ?? 0) + 1,
                openEditor,
            }));
        }
        [120, 350, 800].forEach(delay => window.setTimeout(() => {
            const target = scheduleId == null
                ? document.querySelector(`[data-plan-day-id="${dayId}"]`)
                : document.querySelector(`[data-schedule-id="${scheduleId}"]`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, delay));
    };

    const openPlanSearchResult = (result: PlanSearchResult) => {
        setPlanSearchQuery('');
        openPlanDay(result.dayId, result.scheduleId, false);
    };

    const openScheduleTransfer = (sourceDay: PlanDayResponse, schedule: DayScheduleResponse) => {
        const firstTarget = plan?.days
            .filter(day => day.id !== sourceDay.id)
            .sort((left, right) => left.dayOrder - right.dayOrder)[0];
        if (!firstTarget) {
            showToast({ message: '이동하거나 복사할 다른 일차가 없습니다.', type: 'info' });
            return;
        }
        setScheduleTransferSource({ sourceDay, schedule });
        setScheduleTransferTargetDayId(firstTarget.id);
        setScheduleTransferCopy(false);
        setScheduleTransferAtStart(false);
    };

    const executeScheduleTransfer = async () => {
        if (!scheduleTransferSource || scheduleTransferTargetDayId == null || scheduleTransferLoading) return;
        setScheduleTransferLoading(true);
        try {
            const result = await transferSchedule(scheduleTransferSource.schedule.id, {
                targetDayId: scheduleTransferTargetDayId,
                targetOrder: scheduleTransferAtStart ? 0 : undefined,
                copy: scheduleTransferCopy,
            });
            const nextMap = {
                ...mapSchedulesMapRef.current,
                [result.sourceDayId]: result.sourceSchedules,
                [result.targetDayId]: result.targetSchedules,
            };
            mapSchedulesMapRef.current = nextMap;
            setMapSchedulesMap(nextMap);
            setScheduleRefreshVersions(previous => ({
                ...previous,
                [result.sourceDayId]: (previous[result.sourceDayId] || 0) + 1,
                [result.targetDayId]: (previous[result.targetDayId] || 0) + 1,
            }));
            markPlanAuditStale();
            setScheduleTransferSource(null);
            showToast({ message: scheduleTransferCopy ? '세부일정을 복사했습니다.' : '세부일정을 이동했습니다.', type: 'success' });
            openPlanDay(result.targetDayId, result.scheduleId, false);
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : '세부일정을 옮기지 못했습니다.', type: 'error' });
        } finally {
            setScheduleTransferLoading(false);
        }
    };

    const openCopyDay = (day: PlanDayResponse) => {
        const firstEmpty = fullDays.find(item => !item.data);
        setCopySourceDay(day);
        setCopyName(`${day.dayName} 복사본`);
        setCopyTarget(firstEmpty ? String(firstEmpty.dayOrder) : 'INDEPENDENT');
    };

    const submitCopyDay = async () => {
        if (!copySourceDay || copyingDay) return;
        setCopyingDay(true);
        try {
            await copyPlanDay(copySourceDay.id, {
                targetPlanId: copyTarget === 'INDEPENDENT' ? null : planId,
                targetDayOrder: copyTarget === 'INDEPENDENT' ? null : Number(copyTarget),
                dayName: copyName.trim() || undefined,
            });
            setCopySourceDay(null);
            await fetchPlanDetail();
            markPlanAuditStale();
            showToast({ message: '하루 일정을 복제했습니다.', type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : '하루 일정을 복제하지 못했습니다.', type: 'error' });
        } finally {
            setCopyingDay(false);
        }
    };

    const openSpotLinks = async () => {
        setSpotLinksLoading(true);
        try {
            const groups = await getUnlinkedSpotGroups(planId);
            setSpotLinkGroups(groups);
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : '연결할 장소를 불러오지 못했습니다.', type: 'error' });
        } finally {
            setSpotLinksLoading(false);
        }
    };

    const runDayRouteAudit = async (day: PlanDayResponse, force = false) => {
        if (dayRouteAuditLoadingId != null) return;
        if (!force && dayRouteAudit?.dayId === day.id) {
            setDayRouteAuditOpen(true);
            return;
        }

        setDayRouteAuditLoadingId(day.id);
        try {
            let schedules = mapSchedulesMapRef.current[day.id];
            if (!schedules) {
                schedules = await getSchedulesByDay(day.id);
                const next = { ...mapSchedulesMapRef.current, [day.id]: schedules };
                mapSchedulesMapRef.current = next;
                setMapSchedulesMap(next);
            }
            const legCount = Math.max(0, schedules.length - 1);
            if (legCount > 10 && !await confirm({
                title: `${day.dayOrder}일차 경로 점검`,
                message: `최대 ${legCount}개 구간을 점검합니다. 캐시에 없는 구간은 외부 경로 API를 호출합니다.`,
                confirmLabel: '점검 시작',
            })) return;

            const result = await auditDayRoute(day.id);
            setDayRouteAudit({
                dayId: day.id,
                dayName: day.dayName,
                result,
                checkedAt: Date.now(),
                fingerprint: scheduleAuditFingerprint(schedules),
            });
            setDayRouteAuditOpen(true);
            setVisibleDays(previous => new Set(previous).add(day.id));
            setDayOrderMap(previous => ({ ...previous, [day.id]: day.dayOrder }));
        } catch (error) {
            showToast({
                message: error instanceof Error ? error.message : '이 일차의 전체 경로를 점검하지 못했습니다.',
                type: 'error',
            });
        } finally {
            setDayRouteAuditLoadingId(null);
        }
    };

    const applyDayAuditLegs = async (legs: DayRouteAuditLeg[]) => {
        if (!dayRouteAudit || dayRouteAuditStale || dayRouteApplyLoading) return;
        const applicable = legs.filter((leg): leg is DayRouteAuditLeg & { estimatedDurationMinutes: number } =>
            leg.estimatedDurationMinutes != null
        );
        if (applicable.length === 0) return;
        if (applicable.length > 1 && !await confirm({
            title: '예상 이동시간 전체 적용',
            message: `계산된 ${applicable.length}개 구간의 이동시간을 반영할까요?\n각 구간의 이동 인저리타임은 그대로 유지됩니다.`,
            confirmLabel: '전체 적용',
        })) return;

        setDayRouteApplyLoading(true);
        try {
            const updated = await applyDayRouteEstimates(dayRouteAudit.dayId, applicable.map(leg => ({
                scheduleId: leg.toScheduleId,
                estimatedDurationMinutes: leg.estimatedDurationMinutes,
            })));
            handleSchedulesChange(dayRouteAudit.dayId, updated);
            setScheduleRefreshVersions(previous => ({
                ...previous,
                [dayRouteAudit.dayId]: (previous[dayRouteAudit.dayId] || 0) + 1,
            }));
            setDayRouteAuditOpen(false);
            markPlanAuditStale();
            showToast({ message: `${applicable.length}개 구간의 예상 이동시간을 적용했습니다.`, type: 'success' });
        } catch (error) {
            showToast({
                message: error instanceof Error ? error.message : '예상 이동시간을 적용하지 못했습니다.',
                type: 'error',
            });
        } finally {
            setDayRouteApplyLoading(false);
        }
    };

    const runPlanAudit = async (force = false) => {
        if (planAuditResult && !force) {
            setPlanAuditOpen(true);
            return;
        }
        if (planAuditLoading) return;
        setPlanAuditProgress(null);
        setPlanAuditLoading(true);
        try {
            const result = await auditPlanRoutes(planId);
            setPlanAuditResult(result);
            hasPlanAuditResultRef.current = true;
            planAuditResultRef.current = result;
            setPlanAuditOpen(true);
            setPlanAuditCheckedAt(Date.now());
            setPlanAuditStale(false);
            setPlanAuditProgress(null);
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : '여행 전체 일정을 점검하지 못했습니다.', type: 'error' });
        } finally {
            setPlanAuditLoading(false);
        }
    };

    const calculatePlanRoutes = async () => {
        if (!planAuditResult || planAuditLoading || planAuditStale) return;
        if (!await confirm({
            title: '여행 전체 경로 점검',
            message: `캐시에 없는 최대 ${planAuditResult.totalLegs}개 구간은 외부 경로 API를 호출합니다. 완료된 날짜부터 결과를 표시합니다.`,
            confirmLabel: '경로까지 점검',
        })) return;

        const targets = planAuditResult.days
            .filter(day => day.dayId != null && day.scheduleCount > 1)
            .map(day => ({ dayId: day.dayId as number, legs: day.scheduleCount - 1 }));
        const totalLegs = targets.reduce((sum, target) => sum + target.legs, 0);
        const controller = new AbortController();
        planAuditAbortRef.current = controller;
        setPlanAuditLoading(true);
        setPlanAuditProgress({ completedLegs: 0, totalLegs, completedDays: 0, totalDays: targets.length });
        let cursor = 0;
        try {
            const worker = async () => {
                while (!controller.signal.aborted) {
                    const targetIndex = cursor++;
                    if (targetIndex >= targets.length) return;
                    const target = targets[targetIndex];
                    let routeAudit = null;
                    let routeAuditError: string | null = null;
                    try {
                        routeAudit = await auditDayRoute(target.dayId, controller.signal);
                    } catch (error) {
                        if (error instanceof DOMException && error.name === 'AbortError') return;
                        routeAuditError = error instanceof Error ? error.message : '이 날짜의 경로를 점검하지 못했습니다.';
                    }
                    setPlanAuditResult(previous => {
                        if (!previous) return previous;
                        const days = previous.days.map(day => {
                            if (day.dayId !== target.dayId) return day;
                            const routeIssueCount = routeAudit ? countAdditionalRouteIssues(routeAudit) : 1;
                            return {
                                ...day,
                                routeAudit,
                                routeAuditError,
                                issueCount: day.scheduleIssues.length + routeIssueCount,
                            };
                        });
                        return { ...previous, days, issueCount: days.reduce((sum, day) => sum + day.issueCount, 0) };
                    });
                    setPlanAuditProgress(previous => previous && ({
                        ...previous,
                        completedLegs: previous.completedLegs + target.legs,
                        completedDays: previous.completedDays + 1,
                    }));
                }
            };
            await Promise.all(Array.from({ length: Math.min(3, targets.length) }, () => worker()));
            if (!controller.signal.aborted) {
                setPlanAuditResult(previous => previous && ({ ...previous, routesCalculated: true }));
                setPlanAuditCheckedAt(Date.now());
            } else {
                showToast({ message: '경로 점검을 취소했습니다. 완료된 결과는 유지됩니다.', type: 'info' });
            }
        } finally {
            planAuditAbortRef.current = null;
            setPlanAuditLoading(false);
        }
    };

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
                            <MapDirections
                                daySchedulesMap={mapSchedulesMap}
                                dayOrderMap={dayOrderMap}
                                mapViewMode={mapViewMode}
                                visibleDays={visibleDays}
                                auditedDayRoute={dayRouteAudit && !dayRouteAuditStale ? { dayId: dayRouteAudit.dayId, result: dayRouteAudit.result } : null}
                            />
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

                        {dayRouteAudit && !dayRouteAuditStale && (
                            <div className="absolute right-4 top-16 z-40 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-[10px] font-bold text-gray-600 shadow-lg backdrop-blur">
                                <div className="mb-1 font-black text-gray-800">{dayRouteAudit.dayName} 점검 경로</div>
                                <div className="flex items-center gap-1.5"><span className="h-1 w-5 rounded bg-blue-600" /> 실제 경로</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-amber-500" /> 확인 필요</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-gray-500" /> 실제 선형 없음</div>
                            </div>
                        )}

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
                                    onRefresh={refreshPlanAfterMutation}
                                    onDirtyChange={handleHeaderDirty}
                                />
                            </div>
                            <div className="md:hidden absolute bottom-0 left-0 w-full h-10 flex justify-center items-end pb-2 bg-gradient-to-t from-white via-white/90 to-transparent">
                                <button onClick={() => setIsHeaderExpanded(!isHeaderExpanded)} className="text-[10px] font-bold text-gray-400 bg-white hover:bg-gray-50 px-3 py-1 rounded-full border border-gray-200 shadow-sm flex items-center gap-1 active:scale-95 transition-transform">{isHeaderExpanded ? '접기 ▲' : '상세 정보 ▼'}</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide">
                            <div className="mb-4 px-1 md:flex md:items-center md:justify-between">
                                <div className="mb-2 flex items-center gap-2 md:mb-0">
                                    <h2 className="text-xl font-bold text-gray-800">상세 일정</h2>
                                    <span className={`rounded-full px-2 py-1 text-[10px] font-black transition ${isAnyDirty ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {isAnyDirty ? '● 저장되지 않은 변경사항' : '✓ 저장 완료'}
                                    </span>
                                </div>
                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide [&>button]:shrink-0 [&>button]:whitespace-nowrap">
                                    <button
                                        onClick={() => setShowInjury(!showInjury)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition border shadow-sm ${showInjury ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        ⚽ {showInjury ? '인저리 ON' : 'OFF'}
                                    </button>
                                    <details ref={exportMenuRef} className="relative shrink-0">
                                        <summary className="cursor-pointer list-none rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 shadow-sm transition hover:bg-blue-100">
                                            📤 내보내기 ▾
                                        </summary>
                                        <div className="absolute right-0 top-full z-[120] mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                                            <button
                                                id="save-btn"
                                                type="button"
                                                onClick={() => { exportMenuRef.current?.removeAttribute('open'); void handlePlanExportClick(); }}
                                                className="block w-full rounded-lg px-3 py-2.5 text-left text-xs font-bold text-gray-700 hover:bg-gray-50"
                                            >
                                                📸 전체 이미지 저장
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { exportMenuRef.current?.removeAttribute('open'); void handlePlanDataExport(); }}
                                                className="block w-full rounded-lg px-3 py-2.5 text-left text-xs font-bold text-blue-700 hover:bg-blue-50"
                                            >
                                                💾 계획 파일 내보내기 (JSON)
                                            </button>
                                        </div>
                                    </details>
                                    <button
                                        type="button"
                                        disabled={spotLinksLoading}
                                        onClick={() => void openSpotLinks()}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition border shadow-sm bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 disabled:opacity-50"
                                        title="가져온 문자열 장소를 내 장소 또는 Google 장소에 연결"
                                    >
                                        {spotLinksLoading ? '확인 중...' : '🔗 장소 연결'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={planAuditLoading && !planAuditResult}
                                        onClick={() => void runPlanAudit()}
                                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition border shadow-sm bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
                                        title="여행 전체의 빈 일정, 위치, 시간, 이동수단과 경로를 점검"
                                    >
                                        {planAuditLoading && planAuditResult
                                            ? '🩺 점검 중 · 결과 보기'
                                            : planAuditLoading
                                            ? '점검 중...'
                                            : planAuditResult
                                            ? `🩺 점검 결과${planAuditStale ? ' · 변경됨' : ''}`
                                            : '🩺 전체 점검'}
                                    </button>
                                </div>
                            </div>

                            <div className="sticky top-0 z-20 mb-4 rounded-2xl border border-blue-100 bg-white/95 p-3 shadow-sm backdrop-blur">
                                <div className="relative mb-2">
                                    <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                                        <span className="mr-2 text-sm text-gray-400">⌕</span>
                                        <input
                                            type="search"
                                            value={planSearchQuery}
                                            onChange={event => setPlanSearchQuery(event.target.value)}
                                            onKeyDown={event => {
                                                if (event.key === 'Escape') setPlanSearchQuery('');
                                                if (event.key === 'Enter' && planSearchResults[0]) openPlanSearchResult(planSearchResults[0]);
                                            }}
                                            placeholder="이 여행에서 장소·메모 검색"
                                            aria-label="여행 전체 일정 검색"
                                            className="min-w-0 flex-1 bg-transparent py-2 text-xs font-medium text-gray-700 outline-none placeholder:text-gray-400"
                                        />
                                        {planSearchLoading && <span className="shrink-0 text-[10px] font-bold text-blue-500">불러오는 중…</span>}
                                        {planSearchQuery && !planSearchLoading && (
                                            <button type="button" onClick={() => setPlanSearchQuery('')} className="shrink-0 rounded p-1 text-xs font-bold text-gray-400 hover:bg-gray-200" aria-label="검색어 지우기">✕</button>
                                        )}
                                    </div>
                                    {planSearchQuery.trim() && (
                                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                                            {planSearchQuery.trim().length < 2 ? (
                                                <p className="px-3 py-4 text-center text-xs font-medium text-gray-400">두 글자 이상 입력해 주세요.</p>
                                            ) : planSearchError ? (
                                                <div className="px-3 py-3 text-center">
                                                    <p className="text-xs font-bold text-red-500">{planSearchError}</p>
                                                    <button type="button" onClick={() => void ensureAllPlanSchedulesLoaded()} className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-100">다시 불러오기</button>
                                                </div>
                                            ) : !planSearchLoading && planSearchResults.length === 0 ? (
                                                <p className="px-3 py-4 text-center text-xs font-medium text-gray-400">일치하는 일정이 없습니다.</p>
                                            ) : (
                                                planSearchResults.map(result => (
                                                    <button
                                                        key={result.key}
                                                        type="button"
                                                        onClick={() => openPlanSearchResult(result)}
                                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-blue-50"
                                                    >
                                                        <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600">DAY {result.dayOrder}</span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-xs font-black text-gray-800">{result.title}</span>
                                                            <span className="block truncate text-[10px] text-gray-400">{result.dayName} · {result.detail}</span>
                                                        </span>
                                                        <span className="shrink-0 text-xs font-bold text-blue-500">열기 →</span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {fullDays.map(item => (
                                        <button
                                            key={`jump-day-${item.dayOrder}`}
                                            type="button"
                                            onClick={() => jumpToDay(item)}
                                            className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-black transition ${issueDayOrders.has(item.dayOrder) ? 'border-amber-200 bg-amber-50 text-amber-700' : item.data ? 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                                        >
                                            DAY {item.dayOrder}{issueDayOrders.has(item.dayOrder) ? ' · !' : ''}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
                                    <button type="button" onClick={() => setAllDaysExpanded(true)} className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-100">전체 펼치기</button>
                                    <button type="button" onClick={() => setAllDaysExpanded(false)} className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-100">전체 접기</button>
                                    <button
                                        type="button"
                                        disabled={!planAuditResult}
                                        onClick={() => setShowIssueDaysOnly(previous => !previous)}
                                        className={`ml-auto rounded-lg border px-2.5 py-1 text-[10px] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${showIssueDaysOnly ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
                                        title={planAuditResult ? '점검에서 문제가 발견된 날짜만 표시' : '전체 점검 후 사용할 수 있습니다.'}
                                    >
                                        {showIssueDaysOnly ? '전체 날짜 보기' : `문제 날짜만${planAuditResult ? ` · ${issueDayOrders.size}` : ''}`}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetWorkspaceView}
                                        className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                        title="펼친 일차와 지도 표시 설정을 초기화"
                                    >
                                        화면 설정 초기화
                                    </button>
                                </div>
                            </div>

                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={displayedFullDays.map(d => d.id)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-4">
                                        {displayedFullDays.length === 0 && (
                                            <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center text-sm font-bold text-emerald-700">문제가 발견된 날짜가 없습니다.</div>
                                        )}
                                        {displayedFullDays.map(item => (
                                            item.data ? (
                                                <PlanDayItem
                                                    key={item.id} id={item.id} dayOrder={item.dayOrder} data={item.data}
                                                    routeDate={getPlanDayDate(plan.planStartDate, item.dayOrder)}
                                                    showInjury={showInjury}
                                                    onSchedulesChange={handleSchedulesChange}
                                                    refreshVersion={scheduleRefreshVersions[item.data.id] || 0}
                                                    onRefresh={refreshPlanAfterMutation}
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
                                                    onCopyDay={openCopyDay}
                                                    onAuditDay={(day) => void runDayRouteAudit(day)}
                                                    isRouteAuditLoading={dayRouteAuditLoadingId === item.data.id}
                                                    openRequestKey={dayOpenRequest?.dayId === item.data.id ? dayOpenRequest.key : undefined}
                                                    allOpenRequest={allDaysOpenRequest || undefined}
                                                    expanded={expandedDayIds.has(item.data.id)}
                                                    selectedScheduleId={selectedScheduleId}
                                                    focusRequest={scheduleFocusRequest?.dayId === item.data.id ? { scheduleId: scheduleFocusRequest.scheduleId, key: scheduleFocusRequest.key, openEditor: scheduleFocusRequest.openEditor } : undefined}
                                                    onTransferSchedule={openScheduleTransfer}
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

            {copySourceDay && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                        <div className="mb-5">
                            <div className="text-xs font-black text-violet-500">하루 일정 복제</div>
                            <h3 className="mt-1 text-xl font-black text-gray-900">{copySourceDay.dayName}</h3>
                            <p className="mt-1 text-xs text-gray-400">장소·시간·이동·메모를 복사하고 방문 상태는 초기화합니다.</p>
                        </div>
                        <label className="block text-xs font-bold text-gray-600">
                            복사본 이름
                            <input value={copyName} onChange={event => setCopyName(event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
                        </label>
                        <label className="mt-4 block text-xs font-bold text-gray-600">
                            복제 위치
                            <select value={copyTarget} onChange={event => setCopyTarget(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-400">
                                {fullDays.filter(item => !item.data).map(item => <option key={item.dayOrder} value={item.dayOrder}>{item.dayOrder}일차 빈 자리</option>)}
                                <option value="INDEPENDENT">내 하루 일정에 보관</option>
                            </select>
                        </label>
                        <div className="mt-6 flex gap-2">
                            <button type="button" disabled={copyingDay} onClick={() => setCopySourceDay(null)} className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 hover:bg-gray-200">취소</button>
                            <button type="button" disabled={copyingDay} onClick={() => void submitCopyDay()} className="flex-[2] rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow hover:bg-violet-700 disabled:opacity-50">{copyingDay ? '복제 중...' : '복제하기'}</button>
                        </div>
                    </div>
                </div>
            )}

            {scheduleTransferSource && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <div className="text-xs font-black text-violet-500">세부일정 정리</div>
                                <h3 className="mt-1 text-xl font-black text-gray-900">{scheduleTransferSource.schedule.spotName || '장소명 없음'}</h3>
                                <p className="mt-1 text-xs text-gray-400">{scheduleTransferSource.sourceDay.dayName}에서 다른 일차로 옮깁니다.</p>
                            </div>
                            <button type="button" disabled={scheduleTransferLoading} onClick={() => setScheduleTransferSource(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="이동·복사 창 닫기">✕</button>
                        </div>

                        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                            <button type="button" onClick={() => setScheduleTransferCopy(false)} className={`rounded-lg py-2 text-xs font-black transition ${!scheduleTransferCopy ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>이동</button>
                            <button type="button" onClick={() => setScheduleTransferCopy(true)} className={`rounded-lg py-2 text-xs font-black transition ${scheduleTransferCopy ? 'bg-white text-violet-600 shadow-sm' : 'text-gray-400'}`}>복사</button>
                        </div>

                        <label className="mb-1 block text-xs font-bold text-gray-500">대상 일차</label>
                        <select value={scheduleTransferTargetDayId ?? ''} onChange={event => setScheduleTransferTargetDayId(Number(event.target.value))} className="mb-4 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-bold text-gray-800 outline-none focus:border-blue-400">
                            {plan?.days
                                .filter(day => day.id !== scheduleTransferSource.sourceDay.id)
                                .sort((left, right) => left.dayOrder - right.dayOrder)
                                .map(day => <option key={day.id} value={day.id}>DAY {day.dayOrder} · {day.dayName}</option>)}
                        </select>

                        <label className="mb-1 block text-xs font-bold text-gray-500">추가 위치</label>
                        <div className="mb-5 grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setScheduleTransferAtStart(true)} className={`rounded-xl border py-2.5 text-xs font-bold ${scheduleTransferAtStart ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>맨 위</button>
                            <button type="button" onClick={() => setScheduleTransferAtStart(false)} className={`rounded-xl border py-2.5 text-xs font-bold ${!scheduleTransferAtStart ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>맨 아래</button>
                        </div>

                        <div className="flex gap-2">
                            <button type="button" disabled={scheduleTransferLoading} onClick={() => setScheduleTransferSource(null)} className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50">취소</button>
                            <button type="button" disabled={scheduleTransferLoading} onClick={() => void executeScheduleTransfer()} className="flex-[2] rounded-xl bg-blue-600 py-3 text-sm font-black text-white shadow-md hover:bg-blue-700 disabled:opacity-50">{scheduleTransferLoading ? '처리 중…' : scheduleTransferCopy ? '이 일정을 복사' : '이 일정을 이동'}</button>
                        </div>
                    </div>
                </div>
            )}
            {spotLinkGroups && spotLinkGroups.length > 0 && (
                <SpotLinkModal
                    planId={planId}
                    groups={spotLinkGroups}
                    onClose={() => setSpotLinkGroups(null)}
                    onChanged={async () => {
                        markPlanAuditStale();
                        await fetchPlanDetail();
                        setSpotLinkGroups(await getUnlinkedSpotGroups(planId));
                    }}
                />
            )}
            {spotLinkGroups && spotLinkGroups.length === 0 && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
                        <div className="text-4xl">✅</div>
                        <h2 className="mt-3 text-xl font-black text-gray-900">연결할 장소가 없습니다</h2>
                        <p className="mt-2 text-sm text-gray-500">이 계획의 장소는 모두 내 장소에 연결되어 있거나 장소명이 비어 있습니다.</p>
                        <button type="button" onClick={() => setSpotLinkGroups(null)} className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700">확인</button>
                    </div>
                </div>
            )}
            {dayRouteAudit && dayRouteAuditOpen && (
                <DayRouteAuditModal
                    result={dayRouteAudit.result}
                    onClose={() => setDayRouteAuditOpen(false)}
                    onApplyLeg={leg => void applyDayAuditLegs([leg])}
                    onApplyAll={() => void applyDayAuditLegs(dayRouteAudit.result.legs)}
                    onRecalculate={() => {
                        const day = plan.days.find(item => item.id === dayRouteAudit.dayId);
                        if (day) void runDayRouteAudit(day, true);
                    }}
                    applying={dayRouteApplyLoading}
                    recalculating={dayRouteAuditLoadingId === dayRouteAudit.dayId}
                    checkedAt={dayRouteAudit.checkedAt}
                    stale={dayRouteAuditStale}
                />
            )}
            {planAuditResult && planAuditOpen && (
                <PlanRouteAuditModal
                    result={planAuditResult}
                    loading={planAuditLoading}
                    checkedAt={planAuditCheckedAt}
                    stale={planAuditStale}
                    progress={planAuditProgress}
                    onCalculateRoutes={() => void calculatePlanRoutes()}
                    onCancelCalculation={() => planAuditAbortRef.current?.abort()}
                    onRefresh={() => void runPlanAudit(true)}
                    onOpenDay={(dayId) => openPlanDay(dayId)}
                    onOpenIssue={(dayId, scheduleId) => openPlanDay(dayId, scheduleId)}
                    onAuditDay={(dayId) => {
                        const day = plan.days.find(item => item.id === dayId);
                        if (!day) return;
                        setPlanAuditOpen(false);
                        void runDayRouteAudit(day);
                    }}
                    onClose={() => setPlanAuditOpen(false)}
                />
            )}
        </>
    );
}
