import type { ApiResponse } from '../types/common';
import type { PlanReservation, PlanReservationSaveRequest } from '../types/planReservation';
import { fetchWithAuth } from './utils';

export async function getPlanReservations(planId: number): Promise<PlanReservation[]> {
  const response = await fetchWithAuth(`/api/plans/${planId}/reservations`);
  const json: ApiResponse<PlanReservation[]> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export async function createPlanReservation(planId: number, request: PlanReservationSaveRequest): Promise<PlanReservation> {
  const response = await fetchWithAuth(`/api/plans/${planId}/reservations`, {
    method: 'POST', body: JSON.stringify(request),
  });
  const json: ApiResponse<PlanReservation> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export async function updatePlanReservation(planId: number, reservationId: number, request: PlanReservationSaveRequest): Promise<PlanReservation> {
  const response = await fetchWithAuth(`/api/plans/${planId}/reservations/${reservationId}`, {
    method: 'PUT', body: JSON.stringify(request),
  });
  const json: ApiResponse<PlanReservation> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export async function deletePlanReservation(planId: number, reservationId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/plans/${planId}/reservations/${reservationId}`, { method: 'DELETE' });
  const json: ApiResponse<null> = await response.json();
  if (!json.success) throw new Error(json.message);
}
