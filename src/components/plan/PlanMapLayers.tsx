import { useEffect, useRef } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { DayScheduleResponse } from '../../types/schedule';
import type { DayRouteAuditResponse } from '../../types/route';
import { drawAuditedRouteLeg } from '../../utils/mapRoutePolylines';
import { getPlanDayColor } from '../../utils/mapStyles';

export const getDayColor = getPlanDayColor;

export function NumberedMarker({ number, color }: { number?: number; color: string }) {
    return (
        <div className="relative flex flex-col items-center justify-center filter drop-shadow-md cursor-pointer hover:-translate-y-1 transition-transform group">
            <svg width="30" height="40" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.16 0 0 7.16 0 16C0 24.8 16 42 16 42C16 42 32 24.8 32 16C32 7.16 24.8 0 16 0Z" fill={color} stroke="white" strokeWidth="2" />
            </svg>
            {number !== undefined && <span className="absolute top-[6px] text-white font-bold text-sm">{number}</span>}
        </div>
    );
}

interface PlanMapDirectionsProps {
    simpleDayIds: Set<number>;
    daySchedulesMap: Record<number, DayScheduleResponse[]>;
    dayOrderMap: Record<number, number>;
    mapViewMode: 'ALL' | 'PINS' | 'NONE';
    visibleDays: Set<number>;
    auditedDayRoute: { dayId: number; result: DayRouteAuditResponse } | null;
}

export function PlanMapDirections({ daySchedulesMap, dayOrderMap, mapViewMode, visibleDays, auditedDayRoute, simpleDayIds }: PlanMapDirectionsProps) {
    const map = useMap();
    const mapsLibrary = useMapsLibrary('maps');
    const polylinesRef = useRef<google.maps.Polyline[]>([]);

    useEffect(() => {
        const clearPolylines = () => {
            polylinesRef.current.forEach(polyline => polyline.setMap(null));
            polylinesRef.current = [];
        };

        clearPolylines();
        if (!map || !mapsLibrary || mapViewMode !== 'ALL') return;

        const newPolylines: google.maps.Polyline[] = [];
        const bounds = new google.maps.LatLngBounds();
        let hasPoints = false;

        Object.entries(daySchedulesMap).forEach(([dayIdStr, schedules]) => {
            const dayId = Number(dayIdStr);
            if (!visibleDays.has(dayId) || !schedules) return;
            if (simpleDayIds.has(dayId)) {
                schedules.forEach(schedule => {
                    if (schedule.lat == null || schedule.lng == null) return;
                    const lat = Number(schedule.lat);
                    const lng = Number(schedule.lng);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return;
                    bounds.extend({ lat, lng });
                    hasPoints = true;
                });
                return;
            }

            const color = getDayColor(dayOrderMap[dayId] || 1);
            if (auditedDayRoute?.dayId === dayId) {
                const locatedSchedules = schedules.filter(schedule => {
                    if (schedule.lat == null || schedule.lng == null) return false;
                    const lat = Number(schedule.lat);
                    const lng = Number(schedule.lng);
                    return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
                });
                for (let index = 1; index < locatedSchedules.length; index++) {
                    const from = locatedSchedules[index - 1];
                    const to = locatedSchedules[index];
                    const leg = auditedDayRoute.result.legs.find(candidate =>
                        candidate.fromScheduleId === from.id && candidate.toScheduleId === to.id
                    );
                    const path = [
                        { lat: Number(from.lat), lng: Number(from.lng) },
                        { lat: Number(to.lat), lng: Number(to.lng) },
                    ];
                    if (leg) {
                        const drawing = drawAuditedRouteLeg({ mapsLibrary, map, leg, from, to });
                        if (drawing) {
                            if (!drawing.actualRoute) {
                                const connector = new mapsLibrary.Polyline({
                                    path,
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
                            continue;
                        }
                    }

                    // A locationless schedule sits between these stops, so no audited leg exists.
                    // Keep the map path continuous between the nearest stops that have coordinates.
                    const connector = new mapsLibrary.Polyline({
                        path,
                        geodesic: true,
                        strokeColor: color,
                        strokeOpacity: 0.8,
                        strokeWeight: 5,
                        zIndex: 10,
                        icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }],
                    });
                    connector.setMap(map);
                    newPolylines.push(connector);
                    path.forEach(point => bounds.extend(point));
                    hasPoints = true;
                }
                return;
            }

            const path = schedules.map(schedule => ({
                lat: Number(schedule.lat),
                lng: Number(schedule.lng),
            })).filter(position => !Number.isNaN(position.lat) && !Number.isNaN(position.lng) && position.lat !== 0 && position.lng !== 0);
            if (path.length === 0) return;

            path.forEach(position => bounds.extend(position));
            hasPoints = true;
            const polyline = new mapsLibrary.Polyline({
                path,
                geodesic: true,
                strokeColor: color,
                strokeOpacity: 0.8,
                strokeWeight: 5,
                zIndex: 20,
                icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }],
            });
            polyline.setMap(map);
            newPolylines.push(polyline);
        });

        polylinesRef.current = newPolylines;
        if (hasPoints && !bounds.isEmpty()) {
            const currentBounds = map.getBounds();
            const isAllVisible = currentBounds && currentBounds.contains(bounds.getNorthEast()) && currentBounds.contains(bounds.getSouthWest());
            if (!isAllVisible) map.fitBounds(bounds);
        }
        return clearPolylines;
    }, [map, mapsLibrary, daySchedulesMap, dayOrderMap, mapViewMode, visibleDays, auditedDayRoute, simpleDayIds]);

    return null;
}
