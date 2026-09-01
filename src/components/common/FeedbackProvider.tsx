import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FeedbackContext, type ConfirmOptions, type ToastOptions, type UndoableOptions } from './feedbackContext';
import { FEEDBACK_FLASH_KEY, FEEDBACK_TOAST_EVENT } from './feedbackBus';

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
        showToast(JSON.parse(raw) as ToastOptions);
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

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 left-1/2 z-[20000] flex w-[min(92vw,430px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl ${toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : toast.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-blue-200 bg-white text-gray-700'}`}>
            <span className="min-w-0 flex-1 text-sm font-bold">{toast.message}</span>
            {toast.actions?.map(action => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black text-white ${action.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {action.label}
              </button>
            ))}
            {!toast.actions?.length && (
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="알림 닫기" className="shrink-0 text-gray-400 hover:text-gray-700">×</button>
            )}
          </div>
        ))}
      </div>
      {confirmState && (
        <div className="fixed inset-0 z-[21000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="feedback-confirm-title">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="feedback-confirm-title" className="text-xl font-black text-gray-900">{confirmState.title}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-500">{confirmState.message}</p>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => closeConfirm(false)} className="flex-1 rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-600 hover:bg-gray-200">취소</button>
              <button type="button" onClick={() => closeConfirm(true)} className={`flex-1 rounded-xl py-3 text-sm font-bold text-white shadow ${confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{confirmState.confirmLabel || '확인'}</button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
