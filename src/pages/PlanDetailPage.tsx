import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useBlocker } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { APIProvider, useMapsLibrary, type MapMouseEvent } from "@vis.gl/react-google-maps";

// API
import { exportPlanData, getPlanDetail } from "../api/planApi";
import { copyPlanDay, createDayInPlan, swapPlanDay } from "../api/dayApi";
import { getSchedulesByDay, getUnlinkedSpotGroups, ScheduleEditConflictError, transferSchedule, updateSchedule as updateScheduleApi, type UnlinkedSpotGroup } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi";
import { applyDayRouteEstimates, auditDayRoute } from "../api/routeApi";
// ✅ 지도 생성 API
import { makeStaticGoogleMap } from "../api/mapApi";

// Components
import PlanHeader from "../components/plan/PlanHeader";
import PlanCollaboratorsBar from "../components/plan/PlanCollaboratorsBar";
import PlanShareModal from "../components/plan/PlanShareModal";
import PlanDayItem from "../components/plan/PlanDayItem";
import SpotLinkModal from "../components/plan/SpotLinkModal";
import PlanRouteAuditModal from "../components/plan/PlanRouteAuditModal";
import EmptyPlanDaySlot from "../components/plan/EmptyPlanDaySlot";
import PlanMapPanel from "../components/plan/PlanMapPanel";
import SaveStatusIndicator from "../components/common/SaveStatusIndicator";
import LoadErrorState from "../components/common/LoadErrorState";
import DayRouteAuditModal from "../components/day/DayRouteAuditModal";
import { usePlanRouteAudit } from "../hooks/usePlanRouteAudit";

// Types & Utils
import type { PlanDetailResponse } from "../types/plan";
import type { PlanDayResponse, ScheduleMode } from "../types/planDay.ts";
import type { DayScheduleResponse, ScheduleUpdateRequest } from "../types/schedule";
import type { SpotCreateRequest } from "../types/spot";
import type { DayRouteAuditLeg, DayRouteAuditResponse } from "../types/route";

// ✅ Export 관련 컴포넌트
import {
    ImageExportModal,
    PlanScheduleExportView
} from "../components/common/ScheduleExport";
import { useScheduleExport } from "../components/common/useScheduleExport";
import { getStaticMapQuery, type ExportSection } from "../components/common/scheduleExportUtils";
import { useDialogFocus } from '../hooks/useDialogFocus';
import { usePlanLiveUpdates } from '../hooks/usePlanLiveUpdates';
import { useFeedback } from "../components/common/useFeedback";
import { saveOfflineTripSnapshot } from "../utils/offlineHomeStorage";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const scrollbarHideStyle = `.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;
const planToolbarButtonClass = "inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-wait disabled:opacity-50 sm:w-auto";

type PlanWorkspacePreferences = {
    mapViewMode: 'ALL' | 'PINS' | 'NONE';
    showInjury: boolean;
    visibleDayIds: number[];
    expandedDayIds: number[];
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
    const {
        result: planAuditResult,
        open: planAuditOpen,
        loading: planAuditLoading,
        checkedAt: planAuditCheckedAt,
        stale: planAuditStale,
        progress: planAuditProgress,
        setOpen: setPlanAuditOpen,
        runAudit: runPlanAudit,
        calculateRoutes: calculatePlanRoutes,
        cancelCalculation: cancelPlanAuditCalculation,
        markStale: markPlanAuditStale,
        getAuditedScheduleCount,
    } = usePlanRouteAudit(planId, { confirm, showToast });
    const [plan, setPlan] = useState<PlanDetailResponse | null>(null);
    const [offlineSaveLoading, setOfflineSaveLoading] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [collaboratorsRefreshVersion, setCollaboratorsRefreshVersion] = useState(0);
    const simpleDayIds = useMemo(() => new Set(
        plan?.days.filter(day => day.scheduleMode === 'SIMPLE').map(day => day.id) ?? []
    ), [plan?.days]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [mapSchedulesMap, setMapSchedulesMap] = useState<Record<number, DayScheduleResponse[]>>({});
    const mapSchedulesMapRef = useRef<Record<number, DayScheduleResponse[]>>({});
    const [scheduleRefreshVersions, setScheduleRefreshVersions] = useState<Record<number, number>>({});
    const [dayOrderMap, setDayOrderMap] = useState<Record<number, number>>({});
    const [remoteUpdatePending, setRemoteUpdatePending] = useState(false);
    const liveRefreshRequestId = useRef(0);

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
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const planToolsMenuRef = useRef<HTMLDetailsElement>(null);
    const [generatedMapUrl, setGeneratedMapUrl] = useState<string | null>(null);
    const [mapVersion, setMapVersion] = useState(0);
    const [exportSections, setExportSections] = useState<ExportSection[]>([]);
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
    const exportDialogRef = useDialogFocus(isExportMenuOpen, () => setIsExportMenuOpen(false), () => planToolsMenuRef.current?.querySelector('summary') ?? null);
    const copyDialogRef = useDialogFocus(copySourceDay !== null, () => { if (!copyingDay) setCopySourceDay(null); });
    const transferDialogRef = useDialogFocus(scheduleTransferSource !== null, () => { if (!scheduleTransferLoading) setScheduleTransferSource(null); });
    const linkedDialogRef = useDialogFocus(spotLinkGroups?.length === 0, () => setSpotLinkGroups(null));
    const [spotLinksLoading, setSpotLinksLoading] = useState(false);
    const [dayOpenRequest, setDayOpenRequest] = useState<{ dayId: number; key: number } | null>(null);
    const [scheduleFocusRequest, setScheduleFocusRequest] = useState<{ dayId: number; scheduleId: number; key: number; openEditor: boolean } | null>(null);
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
    // 헤더 상태
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

    const geocodingLibrary = useMapsLibrary("geocoding");
    const geocoder = useMemo(
        () => geocodingLibrary ? new geocodingLibrary.Geocoder() : null,
        [geocodingLibrary]
    );

    const [dirtyMap, setDirtyMap] = useState<Record<string | number, boolean>>({});
    const isAnyDirty = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);
    const isAnyDirtyRef = useRef(isAnyDirty);
    isAnyDirtyRef.current = isAnyDirty;
    const blockerPromptActiveRef = useRef(false);

    const blocker = useBlocker(({ currentLocation, nextLocation }) => isAnyDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        const closeToolsMenu = (event: PointerEvent) => {
            const menu = planToolsMenuRef.current;
            if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
        };
        const closeToolsMenuOnEscape = (event: KeyboardEvent) => {
            const menu = planToolsMenuRef.current;
            if (event.key !== 'Escape' || !menu?.open) return;
            event.preventDefault();
            event.stopPropagation();
            menu.open = false;
            menu.querySelector('summary')?.focus();
        };
        document.addEventListener('pointerdown', closeToolsMenu);
        window.addEventListener('keydown', closeToolsMenuOnEscape, true);
        return () => {
            document.removeEventListener('pointerdown', closeToolsMenu);
            window.removeEventListener('keydown', closeToolsMenuOnEscape, true);
        };
    }, []);

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
        liveRefreshRequestId.current += 1;
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
        setIsExportMenuOpen(false);
        planToolsMenuRef.current?.removeAttribute('open');
        setDirtyMap({});
        setMobileViewMode('LIST');
        setIsHeaderExpanded(false);
        setDayRouteAudit(null);
        setDayRouteAuditOpen(false);
        setDayRouteAuditLoadingId(null);
        setDayRouteApplyLoading(false);
        setScheduleFocusRequest(null);
        setScheduleTransferSource(null);
        setScheduleTransferTargetDayId(null);
        setScheduleTransferLoading(false);
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
            setLoadError(null);
            const map: Record<number, number> = {};
            data.days.forEach(d => { map[d.id] = d.dayOrder; });
            setDayOrderMap(map);
        }).catch(() => {
            setLoadError('여행 정보를 불러오지 못했습니다.');
        }).finally(() => setLoading(false));
    }, [planId]);

    const refreshForLiveUpdate = useCallback(async () => {
        if (isAnyDirty) {
            setRemoteUpdatePending(true);
            return;
        }
        const requestId = ++liveRefreshRequestId.current;
        try {
            const latestPlan = await getPlanDetail(planId);
            const loadedDayIds = Object.keys(mapSchedulesMapRef.current).map(Number);
            const validLoadedDayIds = loadedDayIds.filter(dayId => latestPlan.days.some(day => day.id === dayId));
            const loadedSchedules = await Promise.all(validLoadedDayIds.map(async dayId => ({
                dayId,
                schedules: await getSchedulesByDay(dayId),
            })));
            if (requestId !== liveRefreshRequestId.current) return;
            if (isAnyDirtyRef.current) {
                setRemoteUpdatePending(true);
                return;
            }
            const nextSchedulesMap: Record<number, DayScheduleResponse[]> = {};
            loadedSchedules.forEach(({ dayId, schedules }) => { nextSchedulesMap[dayId] = schedules; });
            mapSchedulesMapRef.current = nextSchedulesMap;
            setMapSchedulesMap(nextSchedulesMap);
            setPlan(latestPlan);
            setDayOrderMap(Object.fromEntries(latestPlan.days.map(day => [day.id, day.dayOrder])));
            setScheduleRefreshVersions(previous => {
                const next = { ...previous };
                validLoadedDayIds.forEach(dayId => { next[dayId] = (next[dayId] ?? 0) + 1; });
                return next;
            });
            setCollaboratorsRefreshVersion(version => version + 1);
            markPlanAuditStale();
            setLoadError(null);
            setRemoteUpdatePending(false);
        } catch {
            if (requestId !== liveRefreshRequestId.current) return;
            setRemoteUpdatePending(true);
        }
    }, [getSchedulesByDay, isAnyDirty, markPlanAuditStale, planId]);

    const liveConnectionState = usePlanLiveUpdates(planId, refreshForLiveUpdate);

    useEffect(() => {
        if (isAnyDirty) liveRefreshRequestId.current += 1;
    }, [isAnyDirty]);

    useEffect(() => {
        if (!isAnyDirty && remoteUpdatePending) void refreshForLiveUpdate();
    }, [isAnyDirty, refreshForLiveUpdate, remoteUpdatePending]);

    const savePlanForOffline = async () => {
        if (!plan) return;
        const username = localStorage.getItem('username');
        if (!username) {
            showToast({ message: '계정 정보를 확인할 수 없습니다.', type: 'error' });
            return;
        }

        setOfflineSaveLoading(true);
        try {
            const days = await Promise.all(plan.days.map(async day => ({
                ...day,
                schedules: mapSchedulesMap[day.id] ?? await getSchedulesByDay(day.id),
            })));
            await saveOfflineTripSnapshot({ plan, days }, username);
            showToast({ message: `여행 일정 ${days.length}일을 이 기기에 저장했습니다.`, type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : '오프라인 저장에 실패했습니다.', type: 'error' });
        } finally {
            setOfflineSaveLoading(false);
        }
    };

    useEffect(() => { mapSchedulesMapRef.current = mapSchedulesMap; }, [mapSchedulesMap]);
    useEffect(() => { if (planId) fetchPlanDetail(); }, [planId, fetchPlanDetail]);

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

    const onModalConfirm = async (mapState?: { center: { lat: number, lng: number }, zoom: number }) => {
        const targetSchedules = exportSections.flatMap(section => section.schedules);
        const query = exportOptions.map ? getStaticMapQuery(targetSchedules, mapState) : null;

        if (exportOptions.map && !query) {
            showToast({ message: "지도에 표시할 위치가 있는 일정이 없습니다.", type: 'info' });
            return;
        }

        if (query) {
            try {
                const blobUrl = await makeStaticGoogleMap(query);
                setGeneratedMapUrl(prev => { if(prev) URL.revokeObjectURL(prev); return blobUrl; });
                setMapVersion(v => v + 1);
            } catch(e) {
                console.error(e);
                showToast({ message: e instanceof Error ? e.message : "내보내기용 지도를 만들지 못했습니다.", type: 'error' });
                return;
            }
        }

        const filename = plan?.planName || "여행_전체일정";
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

    const refreshPlanAfterMutation = useCallback(() => {
        markPlanAuditStale();
        fetchPlanDetail();
    }, [fetchPlanDetail, markPlanAuditStale]);

    const handleSchedulesChange = useCallback((dayId: number, newSchedules: DayScheduleResponse[]) => {
        const previous = mapSchedulesMapRef.current[dayId];
        const auditedScheduleCount = getAuditedScheduleCount(dayId);
        const hydratedAfterAudit = previous?.length === 0 && auditedScheduleCount === newSchedules.length;
        if (previous && !hydratedAfterAudit && scheduleAuditFingerprint(previous) !== scheduleAuditFingerprint(newSchedules)) {
            markPlanAuditStale();
        }
        const next = { ...mapSchedulesMapRef.current, [dayId]: newSchedules };
        mapSchedulesMapRef.current = next;
        setMapSchedulesMap(next);
    }, [getAuditedScheduleCount, markPlanAuditStale]);

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
        const expectedVersion = mapSchedulesMapRef.current[dayId]?.find(schedule => schedule.id === scheduleId)?.version;
        if (expectedVersion == null) return showToast({ message: '최신 일정 정보를 확인하지 못했습니다. 다시 불러와 주세요.', type: 'error' });
        let updateRequest: ScheduleUpdateRequest | null = null;
        try {
            const savedSpot = await createSpot(tempSelectedSpot);
            updateRequest = {
                expectedVersion,
                spotUserId: savedSpot.id,
                spotName: savedSpot.displayName?.trim() || savedSpot.spotName,
                spotType: savedSpot.spotType,
                lat: savedSpot.lat,
                lng: savedSpot.lng,
            };
            const updatedSchedules = await updateScheduleApi(scheduleId, updateRequest);
            setMapSchedulesMap(prev => ({ ...prev, [dayId]: updatedSchedules }));
            setScheduleRefreshVersions(prev => ({ ...prev, [dayId]: (prev[dayId] || 0) + 1 }));
            markPlanAuditStale();
            setTempSelectedSpot(null);
            setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
            showToast({ message: "내 장소에 등록하고 일정에 선택했습니다.", type: 'success' });
        } catch (error) {
            if (error instanceof ScheduleEditConflictError && updateRequest) {
                let latest = error.latestSchedule;
                if (!latest) {
                    try { latest = (await getSchedulesByDay(dayId)).find(schedule => schedule.id === scheduleId) ?? null; }
                    catch { latest = null; }
                }
                if (latest) {
                    const original = mapSchedulesMapRef.current[dayId]?.find(schedule => schedule.id === scheduleId);
                    const applyMine = await confirm({
                        title: '일정 위치 수정 충돌',
                        message: `처음 장소: ${original?.spotName || '없음'} (${original?.lat ?? '위치 없음'}, ${original?.lng ?? '위치 없음'})\n내 선택: ${updateRequest.spotName} (${updateRequest.lat}, ${updateRequest.lng})\n최신 저장값: ${latest.spotName || '없음'} (${latest.lat ?? '위치 없음'}, ${latest.lng ?? '위치 없음'})\n\n확인을 누르면 내 장소 선택을 최신 일정에 적용하고, 취소하면 최신 저장값을 사용합니다.`,
                        confirmLabel: '내 장소 선택 적용',
                    });
                    if (applyMine) {
                        try {
                            const updatedSchedules = await updateScheduleApi(scheduleId, { ...updateRequest, expectedVersion: latest.version });
                            mapSchedulesMapRef.current = { ...mapSchedulesMapRef.current, [dayId]: updatedSchedules };
                            setMapSchedulesMap(previous => ({ ...previous, [dayId]: updatedSchedules }));
                            setScheduleRefreshVersions(previous => ({ ...previous, [dayId]: (previous[dayId] || 0) + 1 }));
                            markPlanAuditStale();
                            setTempSelectedSpot(null);
                            setPickingTarget(null);
                            if (window.innerWidth < 768) setMobileViewMode('LIST');
                            return;
                        } catch (retryError) {
                            showToast({ message: retryError instanceof Error ? retryError.message : '최신 일정에 내 장소 선택을 적용하지 못했습니다.', type: 'error' });
                            return;
                        }
                    }
                    await refreshForLiveUpdate();
                    setTempSelectedSpot(null);
                    setPickingTarget(null);
                    return;
                }
            }
            showToast({ message: error instanceof Error ? error.message : "장소를 등록하지 못했습니다.", type: 'error' });
        }
    };

    const handleConfirmScheduleOnly = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { dayId, scheduleId } = pickingTarget;
        const expectedVersion = mapSchedulesMapRef.current[dayId]?.find(schedule => schedule.id === scheduleId)?.version;
        if (expectedVersion == null) return showToast({ message: '최신 일정 정보를 확인하지 못했습니다. 다시 불러와 주세요.', type: 'error' });
        const updateRequest: ScheduleUpdateRequest = {
            expectedVersion,
            spotUserId: 0,
            spotName: tempSelectedSpot.spotName,
            spotType: tempSelectedSpot.spotType,
            lat: tempSelectedSpot.lat,
            lng: tempSelectedSpot.lng,
        };
        try {
            const updatedSchedules = await updateScheduleApi(scheduleId, updateRequest);
            setMapSchedulesMap(prev => ({ ...prev, [dayId]: updatedSchedules }));
            setScheduleRefreshVersions(prev => ({ ...prev, [dayId]: (prev[dayId] || 0) + 1 }));
            markPlanAuditStale();
            setTempSelectedSpot(null);
            setPickingTarget(null);
            if (window.innerWidth < 768) setMobileViewMode('LIST');
        } catch (error) {
            if (error instanceof ScheduleEditConflictError) {
                let latest = error.latestSchedule;
                if (!latest) {
                    try { latest = (await getSchedulesByDay(dayId)).find(schedule => schedule.id === scheduleId) ?? null; }
                    catch { latest = null; }
                }
                if (latest) {
                    const original = mapSchedulesMapRef.current[dayId]?.find(schedule => schedule.id === scheduleId);
                    const applyMine = await confirm({
                        title: '일정 위치 수정 충돌',
                        message: `처음 장소: ${original?.spotName || '없음'} (${original?.lat ?? '위치 없음'}, ${original?.lng ?? '위치 없음'})\n내 선택: ${updateRequest.spotName} (${updateRequest.lat}, ${updateRequest.lng})\n최신 저장값: ${latest.spotName || '없음'} (${latest.lat ?? '위치 없음'}, ${latest.lng ?? '위치 없음'})\n\n확인을 누르면 내 위치를 최신 일정에 적용하고, 취소하면 최신 저장값을 사용합니다.`,
                        confirmLabel: '내 위치 적용',
                    });
                    if (applyMine) {
                        try {
                            const updatedSchedules = await updateScheduleApi(scheduleId, { ...updateRequest, expectedVersion: latest.version });
                            mapSchedulesMapRef.current = { ...mapSchedulesMapRef.current, [dayId]: updatedSchedules };
                            setMapSchedulesMap(previous => ({ ...previous, [dayId]: updatedSchedules }));
                            setScheduleRefreshVersions(previous => ({ ...previous, [dayId]: (previous[dayId] || 0) + 1 }));
                            markPlanAuditStale();
                        } catch (retryError) {
                            showToast({ message: retryError instanceof Error ? retryError.message : '최신 일정에 내 위치를 적용하지 못했습니다.', type: 'error' });
                            return;
                        }
                    } else await refreshForLiveUpdate();
                    setTempSelectedSpot(null);
                    setPickingTarget(null);
                    return;
                }
            }
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

    const handleDayInfoUpdate = (updatedDay: PlanDayResponse) => {
        setPlan(prev => {
            if (!prev) return null;
            return {
                ...prev,
                days: prev.days.map(day => day.id === updatedDay.id ? updatedDay : day)
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

    const openPlanDay = (dayId: number, scheduleId?: number, openEditor = true) => {
        setPlanAuditOpen(false);
        setMobileViewMode('LIST');
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
            message: `계산된 ${applicable.length}개 구간의 이동시간을 반영할까요?\n각 구간의 이동 여유시간은 그대로 유지됩니다.`,
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

    if (!plan || plan.id !== planId) return <div className="p-4">{loadError
        ? <LoadErrorState message={loadError} onRetry={fetchPlanDetail} retrying={loading} backTo="/plans" />
        : <div role="status" className="text-center py-20">로딩 중...</div>}</div>;

    return (
        <>
            <style>{scrollbarHideStyle}</style>

            <div style={{ position: "fixed", top: 0, left: "-9999px" }}>
                <div ref={exportRef}>
                    <PlanScheduleExportView
                        key={`plan-export-${planId}-${mapVersion}`}
                        planTitle={plan.planName}
                        planMemo={plan.planMemo || ""}
                        sections={exportSections}
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
                schedules={exportSections.flatMap(section => section.schedules)}
            />

            {isShareModalOpen && (
                <PlanShareModal
                    planId={plan.id}
                    planName={plan.planName}
                    onClose={() => {
                        setIsShareModalOpen(false);
                        setCollaboratorsRefreshVersion(version => version + 1);
                    }}
                />
            )}
            <div className="flex flex-col h-full w-full relative overflow-hidden bg-white">
                <div className="flex w-full h-full relative">
                    <PlanMapPanel
                        mobileViewMode={mobileViewMode}
                        mapViewMode={mapViewMode}
                        mapViewModeLabel={getMapViewModeLabel()}
                        onToggleMapViewMode={toggleMapViewMode}
                        onMapClick={handleMapClick}
                        simpleDayIds={simpleDayIds}
                        mapSchedulesMap={mapSchedulesMap}
                        dayOrderMap={dayOrderMap}
                        visibleDays={visibleDays}
                        dayRouteAudit={dayRouteAudit}
                        dayRouteAuditStale={dayRouteAuditStale}
                        pickingTarget={pickingTarget}
                        onCancelPicking={() => { setPickingTarget(null); setTempSelectedSpot(null); }}
                        selectedScheduleId={selectedScheduleId}
                        onSelectSchedule={setSelectedScheduleId}
                        tempSelectedSpot={tempSelectedSpot}
                        onClearTempSelectedSpot={() => setTempSelectedSpot(null)}
                        onConfirmScheduleOnly={handleConfirmScheduleOnly}
                        onConfirmRegister={handleConfirmRegister}
                        onShowList={() => setMobileViewMode('LIST')}
                    />
                    <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
                        {/* 헤더 영역 (모바일 접기/펼치기 적용) */}
                        <div data-guide-target="plan-detail-header" className={`relative bg-white z-30 flex-shrink-0 border-b border-gray-100 transition-all duration-300 ease-in-out ${!isHeaderExpanded ? 'max-h-[190px] overflow-hidden' : ''} md:max-h-none md:overflow-visible`}>
                            <div className="px-5 py-4 pb-8">
                                <PlanHeader
                                    plan={plan}
                                    onRefresh={refreshPlanAfterMutation}
                                    onDirtyChange={handleHeaderDirty}
                                />
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <PlanCollaboratorsBar planId={plan.id} refreshVersion={collaboratorsRefreshVersion} />
                                    <span role="status" className={`text-xs ${liveConnectionState === 'connected' ? 'text-emerald-700' : 'text-slate-500'}`}>
                                        {liveConnectionState === 'connected' ? '● 실시간 동기화 중' : liveConnectionState === 'unavailable' ? '실시간 연결을 사용할 수 없습니다' : '실시간 연결 중…'}
                                    </span>
                                </div>
                            </div>
                            <div className="md:hidden absolute bottom-0 left-0 w-full h-10 flex justify-center items-end pb-2 bg-gradient-to-t from-white via-white/90 to-transparent">
                                <button onClick={() => setIsHeaderExpanded(!isHeaderExpanded)} className="text-[10px] font-bold text-gray-400 bg-white hover:bg-gray-50 px-3 py-1 rounded-full border border-gray-200 shadow-sm flex items-center gap-1 active:scale-95 transition-transform">{isHeaderExpanded ? '접기 ▲' : '상세 정보 ▼'}</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 pb-24 bg-white scrollbar-hide">
                            {loadError && <LoadErrorState message={loadError} onRetry={fetchPlanDetail} retrying={loading} />}
                            {remoteUpdatePending && <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                                <span>{isAnyDirty ? '공동 편집자가 일정을 바꿨습니다. 현재 편집을 저장하면 최신 내용으로 동기화합니다.' : '공동 편집자가 일정을 바꿨습니다. 최신 내용을 불러오세요.'}</span>
                                <button type="button" disabled={isAnyDirty} onClick={() => void refreshForLiveUpdate()} className="min-h-9 rounded-md bg-white px-3 font-semibold text-blue-700 disabled:opacity-50">최신 내용 불러오기</button>
                            </div>}
                            <div data-guide-target="plan-detail-schedules" className="relative mb-4 flex flex-col gap-3 px-1 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-2 md:shrink-0">
                                    <h2 className="text-xl font-bold text-gray-800">상세 일정</h2>
                                    {plan.accessRole === 'EDITOR' && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">공동 편집</span>}
                                    <SaveStatusIndicator isDirty={isAnyDirty} />
                                </div>
                                <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end">
                                    {plan.accessRole === 'OWNER' && <button
                                        type="button"
                                        onClick={() => setIsShareModalOpen(true)}
                                        className={planToolbarButtonClass}
                                        title="보기 전용 또는 편집 가능 링크 관리"
                                    >
                                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-blue-600">
                                            <path d="M10 13a5 5 0 0 0 7.07 0l3-3A5 5 0 0 0 13 2.93l-1.72 1.72" />
                                            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.72-1.72" />
                                        </svg>
                                        공유
                                    </button>}
                                    <button
                                        type="button"
                                        disabled={offlineSaveLoading}
                                        onClick={() => void savePlanForOffline()}
                                        title="여행 날짜와 모든 일정을 이 기기에 저장해 오프라인에서 확인"
                                        className={planToolbarButtonClass}
                                    >
                                        {offlineSaveLoading ? (
                                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" aria-hidden="true" />
                                        ) : (
                                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-amber-600">
                                                <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                                                <path d="M5 16v4h14v-4" />
                                            </svg>
                                        )}
                                        {offlineSaveLoading ? '저장 중' : '오프라인 저장'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowInjury(!showInjury)}
                                        className={`${planToolbarButtonClass} ${showInjury ? 'border-orange-200 bg-orange-50' : ''}`}
                                        title="일정에 기록된 여유시간 정보 표시 여부"
                                        aria-pressed={showInjury}
                                    >
                                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 ${showInjury ? 'text-orange-600' : 'text-slate-400'}`}>
                                            {showInjury ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></> : <><path d="m3 3 18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>}
                                        </svg>
                                        여유시간 표시
                                        <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${showInjury ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{showInjury ? 'ON' : 'OFF'}</span>
                                    </button>
                                    <details
                                        ref={planToolsMenuRef}
                                        className="relative flex items-center"
                                        onKeyDownCapture={(event) => {
                                            if (event.key !== 'Escape') return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            event.currentTarget.open = false;
                                            event.currentTarget.querySelector('summary')?.focus();
                                        }}
                                    >
                                        <summary
                                            aria-label="더 많은 일정 도구"
                                            title="더 많은 일정 도구"
                                            className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 [&::-webkit-details-marker]:hidden"
                                        >
                                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-slate-500">
                                                <circle cx="5" cy="12" r="1.7" />
                                                <circle cx="12" cy="12" r="1.7" />
                                                <circle cx="19" cy="12" r="1.7" />
                                            </svg>
                                        </summary>
                                        <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.currentTarget.closest('details')?.removeAttribute('open');
                                                    setIsExportMenuOpen(true);
                                                }}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                                                title="계획 전체 일정 이미지 또는 파일 내보내기"
                                            >
                                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-blue-600">
                                                    <path d="M12 15V3m0 0L8 7m4-4 4 4" />
                                                    <path d="M5 13v7h14v-7" />
                                                </svg>
                                                내보내기
                                            </button>
                                            {plan.accessRole === 'OWNER' && <>
                                            <div className="my-1 border-t border-slate-100" />
                                            <button
                                                type="button"
                                                disabled={spotLinksLoading}
                                                onClick={(event) => {
                                                    event.currentTarget.closest('details')?.removeAttribute('open');
                                                    void openSpotLinks();
                                                }}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                                                title="가져온 문자열 장소를 내 장소 또는 Google 장소에 연결"
                                            >
                                                {spotLinksLoading ? (
                                                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" aria-hidden="true" />
                                                ) : (
                                                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-violet-600">
                                                        <path d="M10 13a5 5 0 0 0 7.07 0l3-3A5 5 0 0 0 13 2.93l-1.72 1.72" />
                                                        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3A5 5 0 0 0 11 21.07l1.72-1.72" />
                                                    </svg>
                                                )}
                                                {spotLinksLoading ? '장소 확인 중…' : '장소 연결'}
                                            </button>
                                            </>}
                                            <button
                                                type="button"
                                                disabled={planAuditLoading && !planAuditResult}
                                                onClick={(event) => {
                                                    event.currentTarget.closest('details')?.removeAttribute('open');
                                                    void runPlanAudit();
                                                }}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                                                title="여행 전체의 빈 일정, 위치, 시간, 이동수단과 경로를 점검"
                                            >
                                                {planAuditLoading && !planAuditResult ? (
                                                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" aria-hidden="true" />
                                                ) : (
                                                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-emerald-600">
                                                        <path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6" />
                                                        <path d="M16 7h3v3" />
                                                    </svg>
                                                )}
                                                {planAuditLoading && planAuditResult
                                                    ? '점검 중 · 결과 보기'
                                                    : planAuditLoading
                                                    ? '전체 점검 중…'
                                                    : planAuditResult
                                                    ? `점검 결과${planAuditStale ? ' · 변경됨' : ''}`
                                                    : '전체 점검'}
                                            </button>
                                        </div>
                                    </details>
                                </div>
                            </div>

                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={fullDays.map(d => d.id)} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-4">
                                        {fullDays.map(item => (
                                            item.data ? (
                                                <PlanDayItem
                                                    key={item.id} id={item.id} dayOrder={item.dayOrder} data={item.data}
                                                    isOwner={plan.accessRole === 'OWNER'}
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
                                                    onCopyDay={openCopyDay}
                                                    openRequestKey={dayOpenRequest?.dayId === item.data.id ? dayOpenRequest.key : undefined}
                                                    expanded={expandedDayIds.has(item.data.id)}
                                                    selectedScheduleId={selectedScheduleId}
                                                    focusRequest={scheduleFocusRequest?.dayId === item.data.id ? { scheduleId: scheduleFocusRequest.scheduleId, key: scheduleFocusRequest.key, openEditor: scheduleFocusRequest.openEditor } : undefined}
                                                    onTransferSchedule={openScheduleTransfer}
                                                />
                                            ) : (
                                                <EmptyPlanDaySlot key={item.id} dayOrder={item.dayOrder} onCreateNew={(mode) => handleCreateNew(item.dayOrder, mode)} onImportSelect={(src) => handleImportSelect(item.dayOrder, src)} />
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

            {isExportMenuOpen && (
                <div ref={exportDialogRef} role="dialog" aria-modal="true" aria-label="계획 내보내기" tabIndex={-1} className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}>
                    <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <div className="text-xs font-black text-blue-500">PLAN EXPORT</div>
                                <h3 className="mt-1 text-xl font-black text-gray-900">계획 내보내기</h3>
                            </div>
                            <button type="button" onClick={() => setIsExportMenuOpen(false)} className="min-h-11 min-w-11 rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="내보내기 창 닫기">✕</button>
                        </div>
                        <div className="space-y-2">
                            <button
                                id="save-btn"
                                type="button"
                                onClick={() => { setIsExportMenuOpen(false); void handlePlanExportClick(); }}
                                className="block w-full rounded-xl border border-gray-200 px-4 py-3.5 text-left text-sm font-bold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50"
                            >
                                📸 전체 이미지 저장
                                <span className="mt-1 block text-[10px] font-medium text-gray-400">지도와 일차별 일정을 한 장의 이미지로 저장</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIsExportMenuOpen(false); void handlePlanDataExport(); }}
                                className="block w-full rounded-xl border border-gray-200 px-4 py-3.5 text-left text-sm font-bold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50"
                            >
                                💾 계획 파일 내보내기 (JSON)
                                <span className="mt-1 block text-[10px] font-medium text-gray-400">다른 YUME 계정에서 다시 가져올 수 있는 원본 데이터</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {copySourceDay && (
                <div ref={copyDialogRef} role="dialog" aria-modal="true" aria-label="하루 일정 복제" tabIndex={-1} className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
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
                <div ref={transferDialogRef} role="dialog" aria-modal="true" aria-label="세부일정 이동·복사" tabIndex={-1} className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <div className="text-xs font-black text-violet-500">세부일정 정리</div>
                                <h3 className="mt-1 text-xl font-black text-gray-900">{scheduleTransferSource.schedule.spotName || '장소명 없음'}</h3>
                                <p className="mt-1 text-xs text-gray-400">{scheduleTransferSource.sourceDay.dayName}에서 다른 일차로 옮깁니다.</p>
                            </div>
                            <button type="button" disabled={scheduleTransferLoading} onClick={() => setScheduleTransferSource(null)} className="min-h-11 min-w-11 rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="이동·복사 창 닫기">✕</button>
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
                <div ref={linkedDialogRef} role="dialog" aria-modal="true" aria-label="장소 연결 결과" tabIndex={-1} className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
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
                    onCancelCalculation={cancelPlanAuditCalculation}
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
