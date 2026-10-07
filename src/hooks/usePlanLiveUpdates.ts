import { useEffect, useRef, useState } from 'react';
import { PlanLiveUpdateHttpError, subscribeToPlanLiveUpdates } from '../api/planLiveUpdateApi';

export type PlanLiveConnectionState = 'disabled' | 'paused' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

const INITIAL_RECONNECT_DELAY_MS = 1800;
const MAX_RECONNECT_DELAY_MS = 30_000;
const STABLE_CONNECTION_MS = 30_000;

export const usePlanLiveUpdates = (
  planId: number | null | undefined,
  onUpdate: () => void,
  shareToken?: string,
  onUnavailable?: (status: number) => void,
) => {
  const onUpdateRef = useRef(onUpdate);
  const onUnavailableRef = useRef(onUnavailable);
  const hasConnectedRef = useRef(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [connectionState, setConnectionState] = useState<PlanLiveConnectionState>(planId ? 'connecting' : 'disabled');

  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onUnavailableRef.current = onUnavailable; }, [onUnavailable]);
  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', updateVisibility);
    updateVisibility();
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!planId) {
      setConnectionState('disabled');
      return;
    }
    if (!pageVisible) {
      setConnectionState('paused');
      return;
    }

    let stopped = false;
    let controller: AbortController | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let connectionStartedAt = 0;

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        connectionStartedAt = 0;
        setConnectionState(hasConnectedRef.current ? 'reconnecting' : 'connecting');
        try {
          await subscribeToPlanLiveUpdates(
            planId,
            controller.signal,
            () => onUpdateRef.current(),
            () => {
              connectionStartedAt = Date.now();
              setConnectionState('connected');
              if (hasConnectedRef.current) onUpdateRef.current();
              hasConnectedRef.current = true;
            },
            shareToken,
          );
        } catch (error) {
          if (stopped || controller.signal.aborted) break;
          if (error instanceof PlanLiveUpdateHttpError && error.status >= 400 && error.status < 500) {
            setConnectionState('unavailable');
            onUnavailableRef.current?.(error.status);
            break;
          }
        }

        if (stopped) break;
        if (connectionStartedAt > 0 && Date.now() - connectionStartedAt >= STABLE_CONNECTION_MS) {
          reconnectAttempt = 0;
        }
        setConnectionState('reconnecting');
        const baseDelay = Math.min(INITIAL_RECONNECT_DELAY_MS * (2 ** reconnectAttempt), MAX_RECONNECT_DELAY_MS);
        const jitteredDelay = Math.min(
          MAX_RECONNECT_DELAY_MS,
          Math.round(baseDelay * (0.8 + Math.random() * 0.4)),
        );
        reconnectAttempt = Math.min(reconnectAttempt + 1, 5);
        await new Promise<void>(resolve => {
          reconnectTimer = window.setTimeout(resolve, jitteredDelay);
        });
      }
    };

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    };
  }, [pageVisible, planId, shareToken]);

  return connectionState;
};
