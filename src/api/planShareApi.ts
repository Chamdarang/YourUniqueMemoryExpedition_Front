import type { ApiResponse } from '../types/common';
import type { PlanShareLink, PlanShareStatus, PublicPlanShare } from '../types/planShare';
import { fetchWithAuth, getApiUrl } from './utils';

export async function getPlanShareStatus(planId: number): Promise<PlanShareStatus> {
  const response = await fetchWithAuth(`/api/plans/${planId}/share`, { method: 'GET' });
  const json: ApiResponse<PlanShareStatus> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export async function createPlanShareLink(planId: number, expiresInDays: number | null): Promise<PlanShareLink> {
  const response = await fetchWithAuth(`/api/plans/${planId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresInDays }),
  });
  const json: ApiResponse<PlanShareLink> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
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
