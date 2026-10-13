import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useBlocker } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary, InfoWindow, Pin, type MapMouseEvent } from "@vis.gl/react-google-maps";

// API & Hook
import { getPlanDayDetail, PlanDayEditConflictError, updatePlanDay } from "../api/dayApi";
import { getSchedulesByDay, ScheduleEditConflictError } from "../api/scheduleApi";
import { createSpot } from "../api/spotApi";
import { makeStaticGoogleMap } from "../api/mapApi";
import { applyDayRouteEstimates, auditDayRoute } from "../api/routeApi";
import { useSchedule } from "../hooks/useSchedule"; // ✅ useSchedule 훅 임포트
import { usePlanLiveUpdates } from "../hooks/usePlanLiveUpdates";
import EditConflictPanel, { type EditConflictField } from "../components/common/EditConflictPanel";

// Components
import DayScheduleList from "../components/day/DayScheduleList";
import DayRouteAuditModal from "../components/day/DayRouteAuditModal";
import SaveStatusIndicator from "../components/common/SaveStatusIndicator";
import LoadErrorState from "../components/common/LoadErrorState";

// Types & Utils
import type { PlanDayDetailResponse } from "../types/planDay.ts";
import type { PlanDayResponse } from "../types/planDay.ts";
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
import { MAP_COLORS } from "../utils/mapStyles";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const scrollbarHideStyle = `.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }`;

function NumberedMarker({ number, color, onClick }: { number?: number, color: string, onClick?: () => void }) {
    return (
        <div onClick={onClick} className="relative flex flex-col items-center justify-center filter drop-shadow-md cursor-pointer hover:-translate-y-1 transition-transform group">
            <svg width="30" height="40" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2"/>
            </svg>
            {number !== undefined && <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>}
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
                        strokeColor: MAP_COLORS.route,
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
                strokeColor: MAP_COLORS.route,
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
    const [dayEditConflict, setDayEditConflict] = useState<{ original: { dayName: string; memo: string | null }; mine: { dayName: string; memo: string }; latest: PlanDayResponse } | null>(null);
    const dayVersionRef = useRef<number>(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);

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
    const [headerSaveState, setHeaderSaveState] = useState<'IDLE' | 'SAVING' | 'ERROR'>('IDLE');
    const [remoteUpdatePending, setRemoteUpdatePending] = useState(false);
    const liveRefreshRequestId = useRef(0);
    const [dirtySchedules, setDirtySchedules] = useState<Record<number, boolean>>({});
    const headerSaveQueue = useRef<Promise<void>>(Promise.resolve());
    const pendingHeaderSaves = useRef(0);
    const headerDirty = dayDetail != null && (titleForm !== dayDetail.dayName || memoForm !== (dayDetail.memo || ''));
    const isAnyDirty = headerDirty || headerSaveState === 'SAVING' || Object.values(dirtySchedules).some(Boolean);
    const isAnyDirtyRef = useRef(isAnyDirty);
    isAnyDirtyRef.current = isAnyDirty;
    const handleScheduleDirty = useCallback((scheduleId: number, dirty: boolean) => {
        setDirtySchedules(previous => previous[scheduleId] === dirty ? previous : { ...previous, [scheduleId]: dirty });
    }, []);
    const blocker = useBlocker(({ currentLocation, nextLocation }) => isAnyDirty && currentLocation.pathname !== nextLocation.pathname);
    const blockerPromptActive = useRef(false);

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
        if (blocker.state !== 'blocked' || blockerPromptActive.current) return;
        blockerPromptActive.current = true;
        void confirm({
            title: '저장되지 않은 변경사항',
            message: '저장되지 않았거나 저장 중인 변경사항이 있습니다. 이 화면을 떠날까요?',
            confirmLabel: '화면 떠나기',
            danger: true,
        }).then(leave => {
            if (leave) blocker.proceed();
            else blocker.reset();
            blockerPromptActive.current = false;
        });
    }, [blocker, confirm]);

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
        liveRefreshRequestId.current += 1;
        let active = true;
        if (!dayId) {
            setLoadError('올바른 하루 일정 주소가 아닙니다.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setRouteAuditResult(null);
        setRouteAuditOpen(false);
        setRouteAuditCheckedAt(null);
        auditedRouteFingerprintRef.current = null;
        // 기본 정보와 일정 모두 확인한 뒤 화면을 표시합니다.
        void Promise.all([getPlanDayDetail(dayId), fetchSchedules(dayId)]).then(([data, schedulesLoaded]) => {
            if (!active) return;
            if (!schedulesLoaded) throw new Error('일정 조회 실패');
            setDayDetail(data);
            setTitleForm(data.dayName);
            setMemoForm(data.memo || "");
            setLoadError(null);
        }).catch(() => {
            if (active) setLoadError('하루 일정 정보를 불러오지 못했습니다.');
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [dayId, fetchSchedules, loadAttempt]);

    const refreshForLiveUpdate = useCallback(async () => {
        if (!dayDetail?.planId) return;
        if (isAnyDirty) {
            setRemoteUpdatePending(true);
            return;
        }
        const requestId = ++liveRefreshRequestId.current;
        try {
            const [latestDay, latestSchedules] = await Promise.all([
                getPlanDayDetail(dayId),
                getSchedulesByDay(dayId),
            ]);
            if (requestId !== liveRefreshRequestId.current) return;
            if (isAnyDirtyRef.current) {
                setRemoteUpdatePending(true);
                return;
            }
            replaceSchedules(latestSchedules);
            setDayDetail(latestDay);
            setTitleForm(latestDay.dayName);
            setMemoForm(latestDay.memo || '');
            setRouteAuditResult(null);
            setRouteAuditOpen(false);
            setRouteAuditCheckedAt(null);
            auditedRouteFingerprintRef.current = null;
            setRemoteUpdatePending(false);
        } catch {
            if (requestId !== liveRefreshRequestId.current) return;
            setRemoteUpdatePending(true);
        }
    }, [dayDetail?.planId, dayId, isAnyDirty, replaceSchedules]);

    const liveConnectionState = usePlanLiveUpdates(dayDetail?.planId, refreshForLiveUpdate);

    useEffect(() => { if (dayDetail) dayVersionRef.current = dayDetail.version; }, [dayDetail?.version]);

    useEffect(() => {
        if (isAnyDirty) liveRefreshRequestId.current += 1;
    }, [isAnyDirty]);

    useEffect(() => {
        if (!isAnyDirty && remoteUpdatePending) void refreshForLiveUpdate();
    }, [isAnyDirty, refreshForLiveUpdate, remoteUpdatePending]);

    // ✅ 개별 헤더 정보 저장 (이름/메모)
    const handleUpdateDayInfo = async () => {
        if (!dayId || !dayDetail || !headerDirty) return;
        if (!titleForm.trim()) {
            setHeaderSaveState('ERROR');
            return;
        }
        const original = { dayName: dayDetail.dayName, memo: dayDetail.memo };
        const snapshot = { dayName: titleForm, memo: memoForm };
        pendingHeaderSaves.current += 1;
        setHeaderSaveState('SAVING');
        headerSaveQueue.current = headerSaveQueue.current.then(async () => {
            try {
                const updatedDay = await updatePlanDay(dayId, {
                    ...snapshot,
                    expectedVersion: dayVersionRef.current,
                });
                dayVersionRef.current = updatedDay.version;
                setDayDetail(previous => previous?.id === dayId ? { ...previous, dayName: snapshot.dayName, memo: snapshot.memo, version: updatedDay.version } : previous);
                setHeaderSaveState(pendingHeaderSaves.current > 1 ? 'SAVING' : 'IDLE');
            } catch (error) {
                if (error instanceof PlanDayEditConflictError && error.latestDay) {
                    setDayEditConflict({ original, mine: { dayName: snapshot.dayName, memo: snapshot.memo }, latest: error.latestDay });
                }
                setHeaderSaveState(pendingHeaderSaves.current > 1 ? 'SAVING' : 'ERROR');
            } finally {
                pendingHeaderSaves.current -= 1;
            }
        });
        await headerSaveQueue.current;
    };

    const dayConflictFields: EditConflictField[] = dayEditConflict ? [
        { key: 'dayName', label: '일차 이름', original: dayEditConflict.original.dayName, mine: dayEditConflict.mine.dayName, latest: dayEditConflict.latest.dayName },
        { key: 'memo', label: '메모', original: dayEditConflict.original.memo || '', mine: dayEditConflict.mine.memo || '', latest: dayEditConflict.latest.memo || '' },
    ] : [];

    const applyDayConflictMerge = async (values: Record<string, string | null>) => {
        if (!dayEditConflict) return;
        try {
            const updated = await updatePlanDay(dayEditConflict.latest.id, {
                dayName: values.dayName ?? '', memo: values.memo ?? '', expectedVersion: dayEditConflict.latest.version,
            });
            dayVersionRef.current = updated.version;
            setDayDetail(previous => previous?.id === updated.id ? { ...previous, dayName: updated.dayName, memo: updated.memo, version: updated.version } : previous);
            setTitleForm(updated.dayName);
            setMemoForm(updated.memo || '');
            setDayEditConflict(null);
            setHeaderSaveState('IDLE');
        } catch (error) {
            if (error instanceof PlanDayEditConflictError && error.latestDay) {
                setDayEditConflict({ original: { dayName: dayEditConflict.latest.dayName, memo: dayEditConflict.latest.memo }, mine: { dayName: values.dayName ?? '', memo: values.memo ?? '' }, latest: error.latestDay });
            }
            setHeaderSaveState('ERROR');
        }
    };

    const useLatestDayValues = () => {
        if (!dayEditConflict) return;
        dayVersionRef.current = dayEditConflict.latest.version;
        setDayDetail(previous => previous?.id === dayEditConflict.latest.id ? { ...previous, dayName: dayEditConflict.latest.dayName, memo: dayEditConflict.latest.memo, version: dayEditConflict.latest.version } : previous);
        setTitleForm(dayEditConflict.latest.dayName);
        setMemoForm(dayEditConflict.latest.memo || '');
        setDayEditConflict(null);
        setHeaderSaveState('IDLE');
    };

    // ✅ Export 핸들러
    const handleExportClick = () => {
        openExportModal();
    };

    const handleExportConfirm = async (mapState?: { center: { lat: number, lng: number }, zoom: number }) => {
        const query = exportOptions.map ? getStaticMapQuery(schedules, mapState) : null;
        if (exportOptions.map && !query) {
            showToast({ message: "지도에 표시할 위치가 있는 일정이 없습니다.", type: 'info' });
            return;
        }
        if (query) {
            try {
                const blobUrl = await makeStaticGoogleMap(query);
                setGeneratedMapUrl(prev => { if(prev) URL.revokeObjectURL(prev); return blobUrl; });
                setMapVersion(v => v + 1);
            } catch (e) {
                console.error(e);
                showToast({ message: e instanceof Error ? e.message : "내보내기용 지도를 만들지 못했습니다.", type: 'error' });
                return;
            }
        } else {
            setGeneratedMapUrl(previous => {
                if (previous) URL.revokeObjectURL(previous);
                return null;
            });
        }
        requestAnimationFrame(() => void handleSaveImage(titleForm, exportRef.current));
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
        const scheduleVersion = schedules.find(schedule => schedule.id === scheduleId)?.version;
        if (scheduleVersion == null) return showToast({ message: '최신 일정 정보를 확인하지 못했습니다. 다시 불러와 주세요.', type: 'error' });

        const updateReq: ScheduleUpdateRequest = {
            expectedVersion: scheduleVersion,
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
            if (error instanceof ScheduleEditConflictError) {
                let latest = error.latestSchedule;
                if (!latest) {
                    try { latest = (await getSchedulesByDay(dayId)).find(schedule => schedule.id === scheduleId) ?? null; }
                    catch { latest = null; }
                }
                if (latest) {
                    const original = schedules.find(schedule => schedule.id === scheduleId);
                    const applyMine = await confirm({
                        title: '일정 위치 수정 충돌',
                        message: `처음 장소: ${original?.spotName || '없음'} (${original?.lat ?? '위치 없음'}, ${original?.lng ?? '위치 없음'})\n내 선택: ${updateReq.spotName} (${updateReq.lat}, ${updateReq.lng})\n최신 저장값: ${latest.spotName || '없음'} (${latest.lat ?? '위치 없음'}, ${latest.lng ?? '위치 없음'})\n\n확인을 누르면 내 위치를 최신 일정에 적용하고, 취소하면 최신 저장값을 사용합니다.`,
                        confirmLabel: '내 위치 적용',
                    });
                    if (applyMine) {
                        try { await updateSchedule(scheduleId, { ...updateReq, expectedVersion: latest.version }); }
                        catch (retryError) {
                            showToast({ message: retryError instanceof Error ? retryError.message : '최신 일정에 내 위치를 적용하지 못했습니다.', type: 'error' });
                            return;
                        }
                    }
                    await refreshForLiveUpdate();
                    setTempSelectedSpot(null); setPickingTarget(null);
                    if (window.innerWidth < 768) setMobileViewMode('LIST');
                    return;
                }
            }
            showToast({ message: error instanceof Error ? error.message : "일정에 장소를 추가하지 못했습니다.", type: 'error' });
        }
    };

    // ✅ 내 장소 등록 후 추가
    const handleConfirmRegister = async () => {
        if (!tempSelectedSpot || !pickingTarget) return;
        const { scheduleId } = pickingTarget;
        const scheduleVersion = schedules.find(schedule => schedule.id === scheduleId)?.version;
        if (scheduleVersion == null) return showToast({ message: '최신 일정 정보를 확인하지 못했습니다. 다시 불러와 주세요.', type: 'error' });
        let updateReq: ScheduleUpdateRequest | null = null;
        try {
            const savedSpot = await createSpot(tempSelectedSpot);
            updateReq = {
                expectedVersion: scheduleVersion,
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
            if (error instanceof ScheduleEditConflictError && updateReq) {
                let latest = error.latestSchedule;
                if (!latest) {
                    try { latest = (await getSchedulesByDay(dayId)).find(schedule => schedule.id === scheduleId) ?? null; }
                    catch { latest = null; }
                }
                if (latest) {
                    const original = schedules.find(schedule => schedule.id === scheduleId);
                    const applyMine = await confirm({
                        title: '일정 위치 수정 충돌',
                        message: `처음 장소: ${original?.spotName || '없음'} (${original?.lat ?? '위치 없음'}, ${original?.lng ?? '위치 없음'})\n내 선택: ${updateReq.spotName} (${updateReq.lat}, ${updateReq.lng})\n최신 저장값: ${latest.spotName || '없음'} (${latest.lat ?? '위치 없음'}, ${latest.lng ?? '위치 없음'})\n\n확인을 누르면 내 장소 연결을 최신 일정에 적용하고, 취소하면 최신 저장값을 사용합니다.`,
                        confirmLabel: '내 장소 연결 적용',
                    });
                    if (applyMine) {
                        try { await updateSchedule(scheduleId, { ...updateReq, expectedVersion: latest.version }); }
                        catch (retryError) {
                            showToast({ message: retryError instanceof Error ? retryError.message : '최신 일정에 내 장소 연결을 적용하지 못했습니다.', type: 'error' });
                            return;
                        }
                    }
                    await refreshForLiveUpdate();
                    setTempSelectedSpot(null); setPickingTarget(null);
                    if (window.innerWidth < 768) setMobileViewMode('LIST');
                    return;
                }
            }
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
            message: `계산된 ${applicable.length}개 구간의 이동시간을 반영할까요?\n각 구간의 이동 여유시간은 그대로 유지됩니다.`,
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

    if (!dayDetail || dayDetail.id !== dayId) return <div className="p-4">{loadError
        ? <LoadErrorState message={loadError} onRetry={() => setLoadAttempt(value => value + 1)} retrying={loading} backTo="/days" />
        : <div role="status" className="text-center py-20">로딩 중...</div>}</div>;

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
                onConfirm={(mapState) => void handleExportConfirm(mapState)}
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
                            {dayDetail?.scheduleMode !== 'SIMPLE' && <MapDirections schedules={schedules} mapViewMode={mapViewMode} auditResult={routeAuditStale ? null : routeAuditResult} />}
                            {mapViewMode !== 'NONE' && schedules.map((s, index) => {
                                const lat = Number(s.lat);
                                const lng = Number(s.lng);
                                if (!lat || !lng) return null;
                                return <AdvancedMarker key={s.id} position={{ lat, lng }}><NumberedMarker number={dayDetail?.scheduleMode === 'SIMPLE' ? undefined : index + 1} color={MAP_COLORS.route} /></AdvancedMarker>;
                            })}
                            {tempSelectedSpot && (
                                <><AdvancedMarker position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }}><Pin background={MAP_COLORS.saved} borderColor={MAP_COLORS.savedBorder} glyphColor={'white'} /></AdvancedMarker>
                                    <InfoWindow position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }} onCloseClick={() => setTempSelectedSpot(null)} headerContent={<div className="font-bold text-sm">{tempSelectedSpot.spotName}</div>}>
                                        <div className="p-1 min-w-[200px]"><p className="text-xs text-gray-500 mb-3">{tempSelectedSpot.address}</p>
                                            <div className="flex gap-2"><button type="button" onClick={handleConfirmScheduleOnly} className="yume-button yume-button-secondary flex-1">일정에만 추가</button><button type="button" onClick={handleConfirmRegister} className="yume-button yume-button-primary flex-1">내 장소 등록 & 추가</button></div>
                                        </div>
                                    </InfoWindow></>
                            )}
                        </Map>
                        {routeAuditResult && !routeAuditStale && (
                            <div className="absolute right-3 top-3 z-40 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs font-bold text-gray-600 shadow-lg backdrop-blur">
                                <div className="mb-1 font-black text-gray-800">점검 경로</div>
                                <div className="flex items-center gap-1.5"><span className="h-1 w-5 rounded bg-blue-600" /> 실제 경로</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-amber-500" /> 시간 확인 필요</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-gray-400" /> 실제 선형 없음</div>
                                <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-red-500" /> 계산 불가</div>
                            </div>
                        )}
                        <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-6 pointer-events-none">
                            <button onClick={() => setMobileViewMode('LIST')} className="yume-button yume-button-floating pointer-events-auto mx-auto">🔙 목록 보기</button>
                        </div>
                    </div>

                    {/* [2] 일정 리스트 영역 */}
                    <div className={`flex flex-col w-full h-full bg-white md:w-1/2 relative z-10 transition-transform duration-300 ${mobileViewMode === 'MAP' ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
                        {/* 헤더 */}
                        <div data-guide-target="day-detail-toolbar" className="z-30 mx-4 my-3 flex flex-shrink-0 flex-col gap-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:mx-5 md:my-4 md:p-6">
                            <div className="flex items-center gap-2 w-full">
                                <input
                                    type="text"
                                    className="flex-1 min-w-0 truncate bg-transparent text-2xl font-extrabold tracking-tight text-gray-900 outline-none placeholder-gray-300 md:text-3xl"
                                    value={titleForm}
                                    onChange={e => setTitleForm(e.target.value)}
                                    onBlur={handleUpdateDayInfo}
                                    placeholder="일정 제목"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <SaveStatusIndicator isDirty={isAnyDirty} statusOverride={headerSaveState === 'ERROR' ? 'ERROR' : headerSaveState === 'SAVING' ? 'SAVING' : undefined} className="shrink-0" />
                                {dayDetail.planId != null && <span role="status" className={`text-xs ${liveConnectionState === 'connected' ? 'text-emerald-700' : 'text-slate-500'}`}>
                                    {liveConnectionState === 'connected' ? '● 실시간 동기화 중' : liveConnectionState === 'unavailable' ? '실시간 연결을 사용할 수 없습니다' : liveConnectionState === 'paused' ? '탭이 숨겨져 있어 연결을 쉬는 중' : '실시간 연결 중…'}
                                </span>}
                            </div>
                            {remoteUpdatePending && <div role="status" className="yume-card yume-card-info flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                                <span>{isAnyDirty ? '공동 편집자가 일정을 바꿨습니다. 현재 편집을 저장하면 최신 내용으로 동기화합니다.' : '공동 편집자가 일정을 바꿨습니다. 최신 내용을 불러옵니다.'}</span>
                                <button type="button" disabled={isAnyDirty} onClick={() => void refreshForLiveUpdate()} className="yume-button yume-button-soft">최신 내용 불러오기</button>
                            </div>}
                            {headerSaveState === 'ERROR' && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700">
                                <span>{titleForm.trim() ? '변경사항을 저장하지 못했습니다. 입력한 내용은 유지됩니다.' : '일정 제목을 입력해 주세요.'}</span>
                                <button type="button" onClick={() => void handleUpdateDayInfo()} disabled={!titleForm.trim()} className="yume-button yume-button-primary">저장 다시 시도</button>
                            </div>}
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => setShowInjury(!showInjury)}
                                    className={`yume-button min-h-10 shrink-0 whitespace-nowrap text-xs font-semibold shadow-sm ${showInjury ? 'yume-button-warm' : 'yume-button-secondary'}`}
                                >
                                    ⏱️ {showInjury ? '여유시간 표시' : '여유시간 숨김'}
                                </button>
                                <button onClick={handleExportClick} className="yume-button yume-button-secondary min-h-10 shrink-0 whitespace-nowrap text-xs font-semibold shadow-sm">
                                    📸 이미지로 내보내기
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleRouteAudit()}
                                    disabled={routeAuditLoading}
                                    title={`하루 일정의 이동 경로를 점검합니다. 점검 구간 ${routeAuditLegCount}개`}
                                    className="yume-button yume-button-secondary min-h-10 shrink-0 whitespace-nowrap text-xs font-semibold shadow-sm disabled:cursor-wait disabled:opacity-50"
                                >
                                    {routeAuditLoading ? (
                                        <span className="mr-1 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 align-[-2px]" aria-hidden="true" />
                                    ) : (
                                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-1 inline-block h-3.5 w-3.5 align-[-2px] text-slate-500">
                                            <path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6" />
                                            <path d="M16 7h3v3" />
                                        </svg>
                                    )}
                                    {routeAuditLoading && routeAuditResult
                                        ? '점검 중 · 결과 보기'
                                        : routeAuditLoading
                                        ? '전체 점검 중…'
                                        : routeAuditResult
                                        ? `점검 결과${routeAuditStale ? ' · 변경됨' : ''}`
                                        : `전체 점검 · ${routeAuditLegCount}구간`}
                                </button>
                            </div>

                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <textarea
                                    className="w-full bg-transparent outline-none text-sm text-gray-700 resize-none font-medium"
                                    rows={2}
                                    value={memoForm}
                                    onChange={e => setMemoForm(e.target.value)}
                                    onBlur={handleUpdateDayInfo}
                                    placeholder="오늘 일정에 대한 메모를 입력하세요."
                                />
                            </div>
                        </div>

                        <div data-guide-target="day-detail-schedules" className="flex-1 overflow-y-auto p-4 pb-32 bg-white scrollbar-hide relative z-0">
                            {loadError && <LoadErrorState message={loadError} onRetry={() => setLoadAttempt(value => value + 1)} retrying={loading} />}
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <DayScheduleList
                                    variant="card"
                                    schedules={schedules} // ✅ 훅의 실시간 상태 연결
                                    onRefresh={() => fetchSchedules(dayId)}
                                    showInjury={showInjury}
                                    onUpdate={updateSchedule} // ✅ 훅 함수 직접 전달
                                    onItemDirtyChange={handleScheduleDirty}
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
                            <button onClick={() => setMobileViewMode('MAP')} className="yume-button yume-button-floating pointer-events-auto mx-auto">🗺️ 지도 보기</button>
                        </div>
                    </div>
                </div>
            </div>
            {dayEditConflict && <EditConflictPanel
                title="하루 일정 정보 충돌"
                fields={dayConflictFields}
                onApply={values => void applyDayConflictMerge(values)}
                onUseLatest={useLatestDayValues}
                onCancel={() => setDayEditConflict(null)}
            />}
        </>
    );
}
