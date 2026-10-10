import { AdvancedMarker, InfoWindow, Map, Pin, type MapMouseEvent } from '@vis.gl/react-google-maps';
import type { DayScheduleResponse } from '../../types/schedule';
import type { DayRouteAuditResponse } from '../../types/route';
import type { SpotCreateRequest } from '../../types/spot';
import { getDayColor, NumberedMarker, PlanMapDirections } from './PlanMapLayers';
import { MAP_COLORS } from '../../utils/mapStyles';

interface PlanMapPanelProps {
    mobileViewMode: 'LIST' | 'MAP';
    mapViewMode: 'ALL' | 'PINS' | 'NONE';
    mapViewModeLabel: string;
    onToggleMapViewMode: () => void;
    onMapClick: (event: MapMouseEvent) => void;
    simpleDayIds: Set<number>;
    mapSchedulesMap: Record<number, DayScheduleResponse[]>;
    dayOrderMap: Record<number, number>;
    visibleDays: Set<number>;
    dayRouteAudit: { dayId: number; dayName: string; result: DayRouteAuditResponse } | null;
    dayRouteAuditStale: boolean;
    pickingTarget: { dayId: number; scheduleId: number } | null;
    onCancelPicking: () => void;
    selectedScheduleId: number | null;
    onSelectSchedule: (scheduleId: number) => void;
    tempSelectedSpot: SpotCreateRequest | null;
    onClearTempSelectedSpot: () => void;
    onConfirmScheduleOnly: () => void;
    onConfirmRegister: () => void;
    onShowList: () => void;
}

export default function PlanMapPanel({
    mobileViewMode,
    mapViewMode,
    mapViewModeLabel,
    onToggleMapViewMode,
    onMapClick,
    simpleDayIds,
    mapSchedulesMap,
    dayOrderMap,
    visibleDays,
    dayRouteAudit,
    dayRouteAuditStale,
    pickingTarget,
    onCancelPicking,
    selectedScheduleId,
    onSelectSchedule,
    tempSelectedSpot,
    onClearTempSelectedSpot,
    onConfirmScheduleOnly,
    onConfirmRegister,
    onShowList,
}: PlanMapPanelProps) {
    const auditedDayRoute = dayRouteAudit && !dayRouteAuditStale
        ? { dayId: dayRouteAudit.dayId, result: dayRouteAudit.result }
        : null;

    return (
        <div className={`absolute inset-0 z-20 bg-gray-50 transition-transform duration-300 md:relative md:w-1/2 md:translate-x-0 md:z-auto ${mobileViewMode === 'MAP' ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="absolute top-4 right-4 z-50 flex gap-2">
                <button type="button" onClick={onToggleMapViewMode} className="yume-button yume-button-secondary rounded-full shadow-md">{mapViewModeLabel}</button>
            </div>
            {pickingTarget && (
                <button type="button" aria-label="지도 위치 선택 취소" className="yume-button yume-button-success absolute top-6 left-1/2 -translate-x-1/2 z-50 rounded-full shadow-lg border-2 border-white" onClick={onCancelPicking}>
                    <span className="font-bold text-sm">📍 지도에서 위치를 클릭하세요!</span><span className="bg-white/20 px-2 py-0.5 rounded text-xs">취소 X</span>
                </button>
            )}
            <Map defaultCenter={{ lat: 34.9858, lng: 135.7588 }} defaultZoom={13} mapId="DEMO_MAP_ID" disableDefaultUI={true} className="w-full h-full" onClick={onMapClick} gestureHandling="auto">
                <PlanMapDirections
                    simpleDayIds={simpleDayIds}
                    daySchedulesMap={mapSchedulesMap}
                    dayOrderMap={dayOrderMap}
                    mapViewMode={mapViewMode}
                    visibleDays={visibleDays}
                    auditedDayRoute={auditedDayRoute}
                />
                {mapViewMode !== 'NONE' && Object.entries(mapSchedulesMap).flatMap(([dayIdStr, schedules]) => {
                    const dayId = Number(dayIdStr);
                    if (!visibleDays.has(dayId)) return [];
                    const color = getDayColor(dayOrderMap[dayId] || 1);
                    return (schedules || []).map((schedule, index) => {
                        if (!schedule) return null;
                        const lat = Number(schedule.lat);
                        const lng = Number(schedule.lng);
                        if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === 0 && lng === 0)) return null;
                        return (
                            <AdvancedMarker key={schedule.id} position={{ lat, lng }} onClick={() => onSelectSchedule(schedule.id)} zIndex={selectedScheduleId === schedule.id ? 100 : 10}>
                                <NumberedMarker number={simpleDayIds.has(dayId) ? undefined : index + 1} color={color} />
                            </AdvancedMarker>
                        );
                    });
                })}
                {tempSelectedSpot && (
                    <>
                        <AdvancedMarker position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }}>
                            <Pin background={MAP_COLORS.saved} borderColor={MAP_COLORS.savedBorder} glyphColor="white" />
                        </AdvancedMarker>
                        <InfoWindow position={{ lat: tempSelectedSpot.lat, lng: tempSelectedSpot.lng }} onCloseClick={onClearTempSelectedSpot} headerContent={<div className="font-bold text-sm">{tempSelectedSpot.spotName}</div>}>
                            <div className="p-1 min-w-[200px]">
                                <p className="text-xs text-gray-500 mb-3">{tempSelectedSpot.address}</p>
                                <div className="flex gap-2">
                                    <button type="button" onClick={onConfirmScheduleOnly} className="yume-button yume-button-secondary flex-1">일정에만 추가</button>
                                    <button type="button" onClick={onConfirmRegister} className="yume-button yume-button-primary flex-1">내 장소 등록 & 추가</button>
                                </div>
                            </div>
                        </InfoWindow>
                    </>
                )}
            </Map>

            {dayRouteAudit && !dayRouteAuditStale && (
                <div className="absolute right-4 top-16 z-40 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs font-bold text-gray-600 shadow-lg backdrop-blur">
                    <div className="mb-1 font-black text-gray-800">{dayRouteAudit.dayName} 점검 경로</div>
                    <div className="flex items-center gap-1.5"><span className="h-1 w-5 rounded bg-blue-600" /> 실제 경로</div>
                    <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-amber-500" /> 확인 필요</div>
                    <div className="mt-1 flex items-center gap-1.5"><span className="h-1 w-5 border-t-2 border-dashed border-gray-500" /> 실제 선형 없음</div>
                </div>
            )}

            <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full px-6 pointer-events-none">
                <button onClick={onShowList} className="yume-button yume-button-floating pointer-events-auto mx-auto">
                    🔙 목록 보기
                </button>
            </div>
        </div>
    );
}
