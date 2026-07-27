import type { Transportation } from "./enums";

export interface RouteEstimateRequest {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  transportation: Transportation;
  departureTime?: string;
}

export interface RouteEstimateResponse {
  durationMinutes: number;
  distanceMeters: number;
  encodedPolyline: string;
  movingMemo: string;
}
