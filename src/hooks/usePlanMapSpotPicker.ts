import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { MapMouseEvent } from '@vis.gl/react-google-maps';
import { createSpot } from '../api/spotApi';
import { getSchedulesByDay, ScheduleEditConflictError, updateSchedule as updateScheduleApi } from '../api/scheduleApi';
import type { FeedbackContextValue } from '../components/common/feedbackContext';
import type { DayScheduleResponse, ScheduleUpdateRequest } from '../types/schedule';
import type { SpotCreateRequest } from '../types/spot';

type PickingTarget = { dayId: number; scheduleId: number };
type ViewMode = 'LIST' | 'MAP';

type PlanMapSpotPickerOptions = {
  geocoder: google.maps.Geocoder | null;
  mapSchedulesMapRef: { current: Record<number, DayScheduleResponse[]> };
  setMapSchedulesMap: Dispatch<SetStateAction<Record<number, DayScheduleResponse[]>>>;
  setScheduleRefreshVersions: Dispatch<SetStateAction<Record<number, number>>>;
  setMobileViewMode: Dispatch<SetStateAction<ViewMode>>;
  markPlanAuditStale: () => void;
  refreshForLiveUpdate: () => Promise<void>;
  confirm: FeedbackContextValue['confirm'];
  showToast: FeedbackContextValue['showToast'];
};

export function usePlanMapSpotPicker({
  geocoder,
  mapSchedulesMapRef,
  setMapSchedulesMap,
  setScheduleRefreshVersions,
  setMobileViewMode,
  markPlanAuditStale,
  refreshForLiveUpdate,
  confirm,
  showToast,
}: PlanMapSpotPickerOptions) {
  const [pickingTarget, setPickingTarget] = useState<PickingTarget | null>(null);
  const [tempSelectedSpot, setTempSelectedSpot] = useState<SpotCreateRequest | null>(null);

  const handleMapClick = useCallback(async (event: MapMouseEvent) => {
    if (!pickingTarget || !geocoder) return;
    if (event.domEvent) event.domEvent.stopPropagation();

    try {
      if (event.detail?.placeId) {
        const place = new google.maps.places.Place({ id: event.detail.placeId });
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'types', 'googleMapsURI', 'websiteURI', 'regularOpeningHours', 'photos'],
        });

        const addressParts = place.formattedAddress?.split(' ') || [];
        const shortAddress = addressParts.length > 2 ? addressParts.slice(1).join(' ') : (place.formattedAddress || '');
        const openingHours = place.regularOpeningHours?.weekdayDescriptions || [];
        const photoUrl = place.photos?.[0]?.getURI({ maxWidth: 800 }) ?? null;
        setTempSelectedSpot({
          spotName: place.displayName || '선택된 장소',
          spotType: 'OTHER',
          address: place.formattedAddress || '',
          lat: place.location?.lat() || 0,
          lng: place.location?.lng() || 0,
          placeId: event.detail.placeId,
          isVisit: false,
          shortAddress,
          website: place.websiteURI || '',
          googleMapUrl: place.googleMapsURI || '',
          description: '',
          metadata: { originalTypes: place.types || [], openingHours, photoUrl },
        });
        return;
      }

      const clickedLocation = event.detail?.latLng;
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
        metadata: { source: 'map_click' },
      });
    } catch {
      showToast({ message: '선택한 위치의 장소 정보를 불러오지 못했습니다.', type: 'error' });
    }
  }, [geocoder, pickingTarget, showToast]);

  const clearSelection = useCallback(() => {
    setTempSelectedSpot(null);
    setPickingTarget(null);
  }, []);

  const refreshScheduleVersion = useCallback((dayId: number) => {
    setScheduleRefreshVersions(previous => ({ ...previous, [dayId]: (previous[dayId] || 0) + 1 }));
  }, [setScheduleRefreshVersions]);

  const handleConfirmRegister = useCallback(async () => {
    if (!tempSelectedSpot || !pickingTarget) return;
    const { dayId, scheduleId } = pickingTarget;
    const expectedVersion = mapSchedulesMapRef.current[dayId]?.find(schedule => schedule.id === scheduleId)?.version;
    if (expectedVersion == null) {
      showToast({ message: '최신 일정 정보를 확인하지 못했습니다. 다시 불러와 주세요.', type: 'error' });
      return;
    }

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
      setMapSchedulesMap(previous => ({ ...previous, [dayId]: updatedSchedules }));
      refreshScheduleVersion(dayId);
      markPlanAuditStale();
      clearSelection();
      if (window.innerWidth < 768) setMobileViewMode('LIST');
      showToast({ message: '내 장소에 등록하고 일정에 선택했습니다.', type: 'success' });
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
              refreshScheduleVersion(dayId);
              markPlanAuditStale();
              clearSelection();
              if (window.innerWidth < 768) setMobileViewMode('LIST');
              return;
            } catch (retryError) {
              showToast({ message: retryError instanceof Error ? retryError.message : '최신 일정에 내 장소 선택을 적용하지 못했습니다.', type: 'error' });
              return;
            }
          }
          await refreshForLiveUpdate();
          clearSelection();
          return;
        }
      }
      showToast({ message: error instanceof Error ? error.message : '장소를 등록하지 못했습니다.', type: 'error' });
    }
  }, [clearSelection, confirm, mapSchedulesMapRef, markPlanAuditStale, pickingTarget, refreshForLiveUpdate, refreshScheduleVersion, setMapSchedulesMap, setMobileViewMode, showToast, tempSelectedSpot]);

  const handleConfirmScheduleOnly = useCallback(async () => {
    if (!tempSelectedSpot || !pickingTarget) return;
    const { dayId, scheduleId } = pickingTarget;
    const expectedVersion = mapSchedulesMapRef.current[dayId]?.find(schedule => schedule.id === scheduleId)?.version;
    if (expectedVersion == null) {
      showToast({ message: '최신 일정 정보를 확인하지 못했습니다. 다시 불러와 주세요.', type: 'error' });
      return;
    }

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
      setMapSchedulesMap(previous => ({ ...previous, [dayId]: updatedSchedules }));
      refreshScheduleVersion(dayId);
      markPlanAuditStale();
      clearSelection();
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
              refreshScheduleVersion(dayId);
              markPlanAuditStale();
            } catch (retryError) {
              showToast({ message: retryError instanceof Error ? retryError.message : '최신 일정에 내 위치를 적용하지 못했습니다.', type: 'error' });
              return;
            }
          } else await refreshForLiveUpdate();
          clearSelection();
          return;
        }
      }
      showToast({ message: '일정에 장소를 추가하지 못했습니다.', type: 'error' });
    }
  }, [clearSelection, confirm, mapSchedulesMapRef, markPlanAuditStale, pickingTarget, refreshForLiveUpdate, refreshScheduleVersion, setMapSchedulesMap, setMobileViewMode, showToast, tempSelectedSpot]);

  return {
    pickingTarget,
    setPickingTarget,
    tempSelectedSpot,
    setTempSelectedSpot,
    handleMapClick,
    handleConfirmRegister,
    handleConfirmScheduleOnly,
  };
}
