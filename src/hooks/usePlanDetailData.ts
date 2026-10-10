import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlanDetail } from '../api/planApi';
import { getSchedulesByDay } from '../api/scheduleApi';
import type { DayScheduleResponse } from '../types/schedule';
import type { PlanDetailResponse } from '../types/plan';
import { usePlanLiveUpdates } from './usePlanLiveUpdates';

export function usePlanDetailData(
  planId: number,
  isDirty: boolean,
  onRemoteChange: () => void,
) {
  const [plan, setPlan] = useState<PlanDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapSchedulesMap, setMapSchedulesMap] = useState<Record<number, DayScheduleResponse[]>>({});
  const mapSchedulesMapRef = useRef<Record<number, DayScheduleResponse[]>>({});
  const [scheduleRefreshVersions, setScheduleRefreshVersions] = useState<Record<number, number>>({});
  const [dayOrderMap, setDayOrderMap] = useState<Record<number, number>>({});
  const [remoteUpdatePending, setRemoteUpdatePending] = useState(false);
  const [collaboratorsRefreshVersion, setCollaboratorsRefreshVersion] = useState(0);
  const liveRefreshRequestId = useRef(0);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const fetchPlanDetail = useCallback(() => {
    setLoading(true);
    getPlanDetail(planId).then(data => {
      setPlan(data);
      setLoadError(null);
      setDayOrderMap(Object.fromEntries(data.days.map(day => [day.id, day.dayOrder])));
    }).catch(() => {
      setLoadError('여행 정보를 불러오지 못했습니다.');
    }).finally(() => setLoading(false));
  }, [planId]);

  const refreshForLiveUpdate = useCallback(async () => {
    if (isDirtyRef.current) {
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
      if (isDirtyRef.current) {
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
      onRemoteChange();
      setLoadError(null);
      setRemoteUpdatePending(false);
    } catch {
      if (requestId !== liveRefreshRequestId.current) return;
      setRemoteUpdatePending(true);
    }
  }, [onRemoteChange, planId]);

  usePlanLiveUpdates(planId, refreshForLiveUpdate);

  useEffect(() => {
    liveRefreshRequestId.current += 1;
    setMapSchedulesMap({});
    mapSchedulesMapRef.current = {};
    setDayOrderMap({});
  }, [planId]);

  useEffect(() => {
    if (isDirty) liveRefreshRequestId.current += 1;
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty && remoteUpdatePending) void refreshForLiveUpdate();
  }, [isDirty, refreshForLiveUpdate, remoteUpdatePending]);

  useEffect(() => { mapSchedulesMapRef.current = mapSchedulesMap; }, [mapSchedulesMap]);
  useEffect(() => { if (planId) fetchPlanDetail(); }, [planId, fetchPlanDetail]);

  return {
    plan,
    setPlan,
    loading,
    loadError,
    mapSchedulesMap,
    setMapSchedulesMap,
    mapSchedulesMapRef,
    scheduleRefreshVersions,
    setScheduleRefreshVersions,
    dayOrderMap,
    setDayOrderMap,
    remoteUpdatePending,
    collaboratorsRefreshVersion,
    setCollaboratorsRefreshVersion,
    fetchPlanDetail,
    refreshForLiveUpdate,
  };
}
