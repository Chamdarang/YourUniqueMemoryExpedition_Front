import { fetchWithAuth } from './utils';

export interface PlanLiveUpdate {
  planId: number;
  updatedAt: string;
}

export class PlanLiveUpdateHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`실시간 연결 오류 (${status})`);
    this.status = status;
  }
}

export const subscribeToPlanLiveUpdates = async (
  planId: number,
  signal: AbortSignal,
  onUpdate: (update: PlanLiveUpdate) => void,
  onConnected: () => void,
  shareToken?: string,
): Promise<void> => {
  const endpoint = shareToken ? '/api/public/plans/share/events' : `/api/plans/${planId}/events`;
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (shareToken) headers['X-Plan-Share-Token'] = shareToken;
  const response = await fetchWithAuth(endpoint, {
    method: 'GET',
    headers,
    signal,
  });
  if (!response.ok) throw new PlanLiveUpdateHttpError(response.status);
  if (!response.body) throw new Error('실시간 연결 응답을 읽을 수 없습니다.');

  onConnected();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchFrame = (frame: string) => {
    let eventName = 'message';
    const data: string[] = [];
    for (const line of frame.replace(/\r\n/g, '\n').split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (eventName !== 'plan-updated' || data.length === 0) return;
    try {
      onUpdate(JSON.parse(data.join('\n')) as PlanLiveUpdate);
    } catch {
      // Ignore malformed notifications; the next event or reconnect will resync.
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        dispatchFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
};
