import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FeedbackContext, type ConfirmOptions, type ToastOptions, type UndoableOptions } from './feedbackContext';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { FEEDBACK_FLASH_KEY, FEEDBACK_FLASH_TTL_MS, FEEDBACK_TOAST_EVENT } from './feedbackBus';

interface ToastItem extends ToastOptions {
  id: number;
  actions?: Array<{ label: string; onClick: () => void; danger?: boolean }>;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (result: boolean) => void }) | null>(null);
  const [pendingUndoableKeys, setPendingUndoableKeys] = useState<Set<string>>(() => new Set());
  const pendingUndoableKeysRef = useRef(new Set<string>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(items => items.filter(item => item.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions | string) => {
    const normalized = typeof options === 'string' ? { message: options } : options;
    const id = nextId.current++;
    setToasts(items => [...items, { id, type: 'info', duration: 3500, ...normalized }]);
    window.setTimeout(() => dismiss(id), normalized.duration ?? 3500);
  }, [dismiss]);

  useEffect(() => {
    const listener = (event: Event) => showToast((event as CustomEvent<ToastOptions>).detail);
    window.addEventListener(FEEDBACK_TOAST_EVENT, listener);
    try {
      const raw = sessionStorage.getItem(FEEDBACK_FLASH_KEY);
      if (raw) {
        sessionStorage.removeItem(FEEDBACK_FLASH_KEY);
        const flash = JSON.parse(raw) as ToastOptions & { savedAt?: number };
        const age = Date.now() - (flash.savedAt ?? 0);
        if (Number.isFinite(flash.savedAt) && age >= 0 && age <= FEEDBACK_FLASH_TTL_MS) {
          showToast(flash);
        }
      }
    } catch { sessionStorage.removeItem(FEEDBACK_FLASH_KEY); }
    return () => window.removeEventListener(FEEDBACK_TOAST_EVENT, listener);
  }, [showToast]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    setConfirmState({ ...options, resolve });
  }), []);

  const setUndoablePending = useCallback((key: string, pending: boolean) => {
    if (pending) pendingUndoableKeysRef.current.add(key);
    else pendingUndoableKeysRef.current.delete(key);
    setPendingUndoableKeys(new Set(pendingUndoableKeysRef.current));
  }, []);

  const runUndoable = useCallback((options: UndoableOptions) => {
    if (pendingUndoableKeysRef.current.has(options.key)) return false;
    setUndoablePending(options.key, true);

    const id = nextId.current++;
    let finished = false;
    let timerId = 0;

    const commit = async () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timerId);
      dismiss(id);
      try {
        await options.commit();
        if (options.successMessage) showToast({ message: options.successMessage, type: 'success' });
      } catch (error) {
        showToast({ message: error instanceof Error ? error.message : '작업을 완료하지 못했습니다.', type: 'error', duration: 5000 });
      } finally {
        setUndoablePending(options.key, false);
      }
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timerId);
      dismiss(id);
      setUndoablePending(options.key, false);
      showToast({ message: '삭제를 취소했습니다.', type: 'info' });
    };

    setToasts(items => [...items, {
      id,
      message: options.message,
      type: 'info',
      duration: options.duration ?? 6000,
      actions: [
        { label: '실행 취소', onClick: cancel },
        { label: '바로 삭제', onClick: () => void commit(), danger: true },
      ],
    }]);
    timerId = window.setTimeout(() => void commit(), options.duration ?? 6000);
    return true;
  }, [dismiss, setUndoablePending, showToast]);

  const isUndoablePending = useCallback(
    (key: string) => pendingUndoableKeys.has(key),
    [pendingUndoableKeys],
  );

  const value = useMemo(
    () => ({ showToast, runUndoable, isUndoablePending, confirm }),
    [showToast, runUndoable, isUndoablePending, confirm],
  );

  const closeConfirm = (result: boolean) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  const dialogRef = useDialogFocus(Boolean(confirmState), () => closeConfirm(false));

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="yume-toast-region pointer-events-none fixed left-1/2 z-[20000] flex w-[min(92vw,430px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {toasts.map(toast => (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
            className={`yume-toast yume-toast--${toast.type ?? 'info'} pointer-events-auto`}
          >
            <span className="yume-toast-icon" aria-hidden="true">
              {toast.type === 'success' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 4 4L19 6" />
                </svg>
              ) : toast.type === 'error' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4m0 4h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5m0-8h.01" />
                </svg>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="yume-toast-message">{toast.message}</p>
              {toast.actions?.length ? (
                <div className="yume-toast-actions">
                  {toast.actions.map(action => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.onClick}
                      className={`yume-button shrink-0 px-4 ${action.danger ? 'yume-button-danger-solid' : 'yume-button-primary'}`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {!toast.actions?.length && (
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="알림 닫기" className="yume-toast-dismiss">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
      {confirmState && (
        <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[21000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="feedback-confirm-title">
          <div className="yume-card w-full max-w-sm p-6 shadow-xl">
            <h2 id="feedback-confirm-title" className="text-xl font-black text-gray-900">{confirmState.title}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-500">{confirmState.message}</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => closeConfirm(false)} className="yume-button yume-button-secondary flex-1">취소</button>
              <button type="button" onClick={() => closeConfirm(true)} className={`yume-button flex-1 ${confirmState.danger ? 'yume-button-danger-solid' : 'yume-button-primary'}`}>{confirmState.confirmLabel || '확인'}</button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
