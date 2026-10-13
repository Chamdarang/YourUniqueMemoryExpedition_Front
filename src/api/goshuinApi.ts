import { fetchWithAuth } from './utils';
import type { ApiResponse } from '../types/common';
import type { GoshuinBook, GoshuinEntry, GoshuinInput, GoshuinPage } from '../types/goshuin';

export class GoshuinApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth('/api/goshuin' + path, options);
  const result: ApiResponse<T> = await response.json();
  if (!response.ok || !result.success) throw new GoshuinApiError(result.message || '요청을 처리하지 못했습니다.', response.status);
  return result.data;
}
const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });
export const getGoshuinBooks = (signal?: AbortSignal) => request<GoshuinBook[]>('/books', { signal });
export const getGoshuinBook = (id: number) => request<GoshuinBook>('/books/' + id);
export const getGoshuinPurchaseSource = (id: number, signal?: AbortSignal) => request<{ id: number; name: string | null; bookId: number | null }>('/books/from-purchase/' + id, { signal });
export const getGoshuinStats = (signal?: AbortSignal) => request<{ unboundCount: number }>('/stats', { signal });
export const saveGoshuinBook = (id: number | null, input: { name: string; memo: string | null; sourcePurchaseId?: number | null; version?: number }) =>
  request<GoshuinBook>(id ? '/books/' + id : '/books', { method: id ? 'PUT' : 'POST', ...body(input) });
export const deleteGoshuinBook = (book: GoshuinBook, deleteEntries: boolean) =>
  request<void>(`/books/${book.id}?version=${book.version}&deleteEntries=${deleteEntries}`, { method: 'DELETE' });
export const getGoshuinEntries = (params: { bookId?: number; unbound?: boolean; keyword?: string; page?: number }, signal?: AbortSignal) =>
  request<GoshuinPage>('/records?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined).map(([k,v]) => [k,String(v)])), { signal });
export const getGoshuinEntry = (id: number) => request<GoshuinEntry>('/records/' + id);
export const saveGoshuinEntry = (id: number | null, input: GoshuinInput) =>
  request<GoshuinEntry>(id ? '/records/' + id : '/records', { method: id ? 'PUT' : 'POST', ...body(input) });
export const deleteGoshuinEntry = (entry: GoshuinEntry) =>
  request<void>(`/records/${entry.id}?version=${entry.version}`, { method: 'DELETE' });
export const getGoshuinOrder = (bookId: number) => request<GoshuinEntry[]>(`/books/${bookId}/order`);
export const saveGoshuinOrder = (book: GoshuinBook, ids: number[]) =>
  request<GoshuinBook>(`/books/${book.id}/order`, { method: 'PUT', ...body({ ids, version: book.version }) });
export const importGoshuinEntries = (book: GoshuinBook, entries: GoshuinEntry[]) =>
  request<GoshuinBook>(`/books/${book.id}/records`, { method: 'POST', ...body({ ids: entries.map(e => e.id), recordVersions: Object.fromEntries(entries.map(e => [e.id,e.version])), version: book.version }) });
export const uploadGoshuinPhoto = (type: 'books' | 'records', id: number, version: number, file: File) => {
  const form = new FormData(); form.append('file', file);
  return request<string>(`/${type}/${id}/photo?version=${version}`, { method: 'POST', body: form });
};
export const removeGoshuinPhoto = (type: 'books' | 'records', id: number, version: number) =>
  request<void>(`/${type}/${id}/photo?version=${version}`, { method: 'DELETE' });
export async function getGoshuinPhoto(id: string, thumbnail: boolean, signal: AbortSignal) {
  const response = await fetchWithAuth(`/api/goshuin/photos/${encodeURIComponent(id)}?thumbnail=${thumbnail}`, { signal });
  if (!response.ok) throw new Error('사진을 불러오지 못했습니다.');
  return response.blob();
}
export const goshuinMessage = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
