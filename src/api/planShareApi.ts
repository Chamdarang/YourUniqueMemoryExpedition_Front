import type { ApiResponse } from '../types/common';
import type { PlanShareLink, PlanShareStatus, PublicPlanShare, PublicPlanShareSchedule } from '../types/planShare';
import { fetchWithAuth, getApiUrl } from './utils';

export async function getPlanShareStatus(planId: number): Promise<PlanShareStatus> {
  const response = await fetchWithAuth(`/api/plans/${planId}/share`, { method: 'GET' });
  const json: ApiResponse<PlanShareStatus> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export async function createPlanShareLink(planId: number, expiresInDays: number | null, accessMode: 'VIEW' | 'EDIT'): Promise<PlanShareLink> {
  const response = await fetchWithAuth(`/api/plans/${planId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresInDays, accessMode }),
  });
  const json: ApiResponse<PlanShareLink> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export async function acceptPlanShareLink(token: string): Promise<number> {
  const response = await fetchWithAuth('/api/plans/share/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const json: ApiResponse<{ planId: number }> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data.planId;
}

export async function revokePlanShareLink(planId: number): Promise<void> {
  const response = await fetchWithAuth(`/api/plans/${planId}/share`, { method: 'DELETE' });
  const json: ApiResponse<void> = await response.json();
  if (!json.success) throw new Error(json.message);
}

export async function getPublicPlanShare(token: string): Promise<PublicPlanShare> {
  const response = await fetch(getApiUrl('/api/public/plans/share'), {
    method: 'GET',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { 'X-Plan-Share-Token': token },
  });
  const json: ApiResponse<PublicPlanShare> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export async function getPublicPlanDaySchedules(token: string, dayOrder: number): Promise<PublicPlanShareSchedule[]> {
  const response = await fetch(getApiUrl(`/api/public/plans/share/day-schedules?dayOrder=${dayOrder}`), {
    method: 'GET',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: { 'X-Plan-Share-Token': token },
  });
  const json: ApiResponse<PublicPlanShareSchedule[]> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}
