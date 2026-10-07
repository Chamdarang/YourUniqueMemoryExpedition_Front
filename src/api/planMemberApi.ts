import type { ApiResponse } from '../types/common';
import type { PlanCollaboratorResponse, PlanInvitationResponse, PlanMemberResponse, SharedPlanResponse } from '../types/plan';
import { fetchWithAuth } from './utils';

async function readData<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json();
  if (!json.success) throw new Error(json.message);
  return json.data;
}

export const getPlanMembers = async (planId: number) =>
  readData<PlanMemberResponse[]>(await fetchWithAuth(`/api/plans/${planId}/members`));

export const getPlanCollaborators = async (planId: number) =>
  readData<PlanCollaboratorResponse[]>(await fetchWithAuth(`/api/plans/${planId}/collaborators`));

export const invitePlanMember = async (planId: number, username: string) =>
  readData<PlanMemberResponse>(await fetchWithAuth(`/api/plans/${planId}/members`, {
    method: 'POST', body: JSON.stringify({ username }),
  }));

export const removePlanMember = async (planId: number, memberId: number) =>
  readData<void>(await fetchWithAuth(`/api/plans/${planId}/members/${memberId}`, { method: 'DELETE' }));

export const getPlanInvitations = async () =>
  readData<PlanInvitationResponse[]>(await fetchWithAuth('/api/plans/invitations'));

export const acceptPlanInvitation = async (invitationId: number) =>
  readData<void>(await fetchWithAuth(`/api/plans/invitations/${invitationId}/accept`, { method: 'POST' }));

export const declinePlanInvitation = async (invitationId: number) =>
  readData<void>(await fetchWithAuth(`/api/plans/invitations/${invitationId}`, { method: 'DELETE' }));

export const getSharedPlans = async () =>
  readData<SharedPlanResponse[]>(await fetchWithAuth('/api/plans/shared'));
