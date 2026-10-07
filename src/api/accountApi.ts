import type { AccountProfile } from '../types/account';
import type { ApiResponse } from '../types/common';
import { fetchWithAuth } from './utils';

async function readData<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json();
  if (!response.ok || !json.success) throw new Error(json.message);
  return json.data;
}

export const getAccountProfile = async () =>
  readData<AccountProfile>(await fetchWithAuth('/api/account'));

export const updateAccountNickname = async (nickname: string) =>
  readData<AccountProfile>(await fetchWithAuth('/api/account/nickname', {
    method: 'PATCH', body: JSON.stringify({ nickname }),
  }));

export const changeAccountPassword = async (currentPassword: string, newPassword: string) =>
  readData<void>(await fetchWithAuth('/api/account/password', {
    method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }),
  }));

export const deleteAccount = async (password: string) =>
  readData<void>(await fetchWithAuth('/api/account', {
    method: 'DELETE', body: JSON.stringify({ password }),
  }));
