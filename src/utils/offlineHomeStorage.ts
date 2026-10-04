import type { PlanResponse } from '../types/plan';
import type { DayScheduleResponse } from '../types/schedule';

const DATABASE_NAME = 'yume-offline';
const DATABASE_VERSION = 1;
const STORE_NAME = 'home-snapshots';

export interface OfflineHomeSnapshot {
  username: string;
  savedAt: string;
  plan: PlanResponse | null;
  days: Array<{
    id: number;
    dayOrder: number;
    dayName: string;
    memo: string;
    scheduleMode: 'SIMPLE' | 'DETAILED';
    schedules: DayScheduleResponse[];
  }>;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'username' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage'));
  });
}

export async function saveOfflineTripSnapshot(
  snapshot: Omit<OfflineHomeSnapshot, 'savedAt' | 'username'>,
  username: string,
): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ ...snapshot, username, savedAt: new Date().toISOString() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save offline data'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline save was aborted'));
    });
    database.close();
  } catch (error) {
    console.warn('Could not save the offline trip snapshot.', error);
    throw new Error('이 기기에 오프라인 일정을 저장하지 못했습니다. 저장 공간을 확인해 주세요.');
  }
}

export async function getOfflineHomeSnapshot(username: string): Promise<OfflineHomeSnapshot | null> {
  try {
    const database = await openDatabase();
    const snapshot = await new Promise<OfflineHomeSnapshot | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(username);
      request.onsuccess = () => resolve((request.result as OfflineHomeSnapshot | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read offline data'));
    });
    database.close();
    return snapshot;
  } catch {
    return null;
  }
}

export async function clearOfflineHomeSnapshot(username: string): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(username);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear offline data'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Offline data removal was aborted'));
    });
    database.close();
  } catch (error) {
    console.warn('Could not clear the offline home snapshot.', error);
  }
}
