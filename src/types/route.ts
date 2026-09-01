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

export type DayRouteAuditStatus = "OK" | "WARNING" | "ERROR";

export interface DayRouteAuditLeg {
  fromScheduleId: number;
  fromSpotName: string;
  toScheduleId: number;
  toSpotName: string;
  transportation: Transportation | null;
  plannedDurationMinutes: number;
  estimatedDurationMinutes: number | null;
  encodedPolyline: string;
  differenceMinutes: number | null;
  estimatedArrivalTime: string | null;
  fixedStartConflictMinutes: number | null;
  status: DayRouteAuditStatus;
  message: string;
}

export interface DayRouteApplyItem {
  scheduleId: number;
  estimatedDurationMinutes: number;
}

export interface DayRouteAuditResponse {
  totalLegs: number;
  calculatedLegs: number;
  issueCount: number;
  plannedTotalMinutes: number;
  estimatedTotalMinutes: number;
  legs: DayRouteAuditLeg[];
}

export interface PlanScheduleAuditIssue {
  scheduleId: number | null;
  spotName: string;
  severity: "WARNING" | "ERROR";
  code: string;
  message: string;
}

export interface PlanRouteAuditDay {
  dayId: number | null;
  dayOrder: number;
  dayName: string;
  scheduleCount: number;
  issueCount: number;
  scheduleIssues: PlanScheduleAuditIssue[];
  routeAudit: DayRouteAuditResponse | null;
  routeAuditError?: string | null;
}

export interface PlanRouteAuditResponse {
  routesCalculated: boolean;
  maxRouteCalculationLegs: number;
  totalDays: number;
  totalSchedules: number;
  totalLegs: number;
  issueCount: number;
  days: PlanRouteAuditDay[];
}
