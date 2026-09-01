import type { DayRouteAuditLeg } from '../types/route';
import { decodeGooglePolyline } from './polylineUtils';

interface RoutePointSource {
  lat: number | null;
  lng: number | null;
}

interface DrawAuditedRouteLegOptions {
  mapsLibrary: google.maps.MapsLibrary;
  map: google.maps.Map;
  leg: DayRouteAuditLeg;
  from: RoutePointSource;
  to: RoutePointSource;
}

export interface DrawnRouteLeg {
  path: google.maps.LatLngLiteral[];
  polylines: google.maps.Polyline[];
  actualRoute: boolean;
}

export function drawAuditedRouteLeg({ mapsLibrary, map, leg, from, to }: DrawAuditedRouteLegOptions): DrawnRouteLeg | null {
  const fallbackPath = [
    { lat: Number(from.lat), lng: Number(from.lng) },
    { lat: Number(to.lat), lng: Number(to.lng) },
  ];
  if (fallbackPath.some(point => !Number.isFinite(point.lat) || !Number.isFinite(point.lng))) return null;

  let path = fallbackPath;
  let actualRoute = false;
  if (leg.encodedPolyline) {
    try {
      const decoded = decodeGooglePolyline(leg.encodedPolyline);
      if (decoded.length > 1) {
        path = decoded;
        actualRoute = true;
      }
    } catch {
      path = fallbackPath;
    }
  }

  const polylines: google.maps.Polyline[] = [];
  const addPolyline = (options: google.maps.PolylineOptions) => {
    const polyline = new mapsLibrary.Polyline(options);
    polyline.setMap(map);
    polylines.push(polyline);
  };

  if (actualRoute) {
    addPolyline({
      path,
      geodesic: false,
      strokeColor: '#3B82F6',
      strokeOpacity: 0.8,
      strokeWeight: 5,
      zIndex: 20,
      icons: [{
        icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
        offset: '50%',
        repeat: '100px',
      }],
    });

    if (leg.status !== 'OK') {
      const statusColor = leg.status === 'ERROR' ? '#ef4444' : '#f59e0b';
      addPolyline({
        path,
        geodesic: false,
        strokeOpacity: 0,
        zIndex: 30,
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: statusColor, strokeWeight: 3, scale: 2.5 },
          offset: '8px',
          repeat: '32px',
        }],
      });
    }
  } else {
    const color = leg.status === 'ERROR' ? '#ef4444' : leg.status === 'WARNING' ? '#f59e0b' : '#64748b';
    addPolyline({
      path,
      geodesic: true,
      strokeOpacity: 0,
      zIndex: 20,
      icons: [{
        icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: color, strokeWeight: 3, scale: 2 },
        offset: '0',
        repeat: '32px',
      }],
    });
  }

  return { path, polylines, actualRoute };
}
