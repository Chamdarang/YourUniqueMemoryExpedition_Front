import { useEffect } from 'react';
import { AdvancedMarker, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { PublicPlanShareSchedule } from '../../types/planShare';

type RoutePoint = {
  schedule: PublicPlanShareSchedule;
  order: number;
  position: google.maps.LatLngLiteral;
};

function SharedPlanRoute({ points }: { points: RoutePoint[] }) {
  const map = useMap();
  const mapsLibrary = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLibrary || points.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach(point => bounds.extend(point.position));
    if (points.length === 1) {
      map.setCenter(points[0].position);
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 40);
    }

    if (points.length < 2) return;
    const route = new mapsLibrary.Polyline({
      path: points.map(point => point.position),
      geodesic: true,
      strokeColor: '#2563EB',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      icons: [{ icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW }, offset: '50%', repeat: '100px' }],
    });
    route.setMap(map);
    return () => route.setMap(null);
  }, [map, mapsLibrary, points]);

  return null;
}

export default function SharedPlanDayMap({ schedules, mapsEnabled }: { schedules: PublicPlanShareSchedule[]; mapsEnabled: boolean }) {
  const points: RoutePoint[] = schedules.flatMap((schedule, index) => {
    if (schedule.lat == null || schedule.lng == null || !Number.isFinite(schedule.lat) || !Number.isFinite(schedule.lng)) return [];
    return [{ schedule, order: index + 1, position: { lat: schedule.lat, lng: schedule.lng } }];
  });

  return (
    <div className="border-b border-slate-100 bg-slate-50/70 p-3 md:px-5">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-black text-slate-700">방문 순서 지도</h3>
        <span className="text-[10px] font-semibold text-slate-400">장소 사이를 순서대로 연결</span>
      </div>
      {!mapsEnabled ? (
        <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 text-center text-xs font-semibold text-slate-400">
          지도 설정이 없어 경로 지도를 표시할 수 없습니다.
        </div>
      ) : points.length > 0 ? (
        <Map
          defaultCenter={points[0].position}
          defaultZoom={12}
          mapId="YUME_SHARED_PLAN_MAP"
          disableDefaultUI={true}
          zoomControl={true}
          gestureHandling="cooperative"
          className="h-56 w-full overflow-hidden rounded-2xl md:h-64"
        >
          <SharedPlanRoute points={points} />
          {points.map(point => (
            <AdvancedMarker
              key={`${point.order}-${point.schedule.scheduleOrder}`}
              position={point.position}
              title={`${point.order}. ${point.schedule.spotName || '장소 미정'}`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-xs font-black text-white shadow-lg">
                {point.order}
              </span>
            </AdvancedMarker>
          ))}
        </Map>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 text-center text-xs font-semibold text-slate-400">
          위치 정보가 있는 일정이 없어 지도를 표시할 수 없습니다.
        </div>
      )}
    </div>
  );
}
