import { useEffect, useRef, useState } from 'react';
import { PlanLiveUpdateHttpError, subscribeToPlanLiveUpdates } from '../api/planLiveUpdateApi';

export type PlanLiveConnectionState = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

export const usePlanLiveUpdates = (
  planId: number | null | undefined,
  onUpdate: () => void,
  shareToken?: string,
  onUnavailable?: (status: number) => void,
) => {
  const onUpdateRef = useRef(onUpdate);
  const onUnavailableRef = useRef(onUnavailable);
  const [connectionState, setConnectionState] = useState<PlanLiveConnectionState>(planId ? 'connecting' : 'disabled');

  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onUnavailableRef.current = onUnavailable; }, [onUnavailable]);

  useEffect(() => {
    if (!planId) {
      setConnectionState('disabled');
      return;
    }

    let stopped = false;
    let hasConnected = false;
    let controller: AbortController | null = null;
    let reconnectTimer: number | null = null;

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        setConnectionState(hasConnected ? 'reconnecting' : 'connecting');
        try {
          await subscribeToPlanLiveUpdates(
            planId,
            controller.signal,
            () => onUpdateRef.current(),
            () => {
              setConnectionState('connected');
              if (hasConnected) onUpdateRef.current();
              hasConnected = true;
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
        setConnectionState('reconnecting');
        await new Promise<void>(resolve => {
          reconnectTimer = window.setTimeout(resolve, 1800);
        });
      }
    };

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    };
  }, [planId, shareToken]);

  return connectionState;
};
