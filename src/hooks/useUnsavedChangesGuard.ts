import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import type { FeedbackContextValue } from '../components/common/feedbackContext';

export function useUnsavedChangesGuard(confirm: FeedbackContextValue['confirm']) {
  const [dirtyMap, setDirtyMap] = useState<Record<string | number, boolean>>({});
  const isDirty = useMemo(() => Object.values(dirtyMap).some(Boolean), [dirtyMap]);
  const blockerPromptActiveRef = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  const setDirty = useCallback((itemId: string | number, dirty: boolean) => {
    setDirtyMap(previous => previous[itemId] === dirty ? previous : { ...previous, [itemId]: dirty });
  }, []);
  const clearDirty = useCallback(() => setDirtyMap({}), []);
  const setHeaderDirty = useCallback((dirty: boolean) => setDirty('header', dirty), [setDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const preventUnsavedReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnsavedReload);
    return () => window.removeEventListener('beforeunload', preventUnsavedReload);
  }, [isDirty]);

  useEffect(() => {
    if (blocker.state !== 'blocked' || blockerPromptActiveRef.current) return;
    blockerPromptActiveRef.current = true;
    void confirm({
      title: '저장되지 않은 변경사항',
      message: '저장되지 않은 변경사항이 있습니다. 저장하지 않고 이동할까요?',
      confirmLabel: '저장하지 않고 이동',
      danger: true,
    }).then(shouldProceed => {
      if (shouldProceed) {
        clearDirty();
        setTimeout(() => blocker.proceed(), 0);
      } else blocker.reset();
      blockerPromptActiveRef.current = false;
    });
  }, [blocker, clearDirty, confirm]);

  return { isDirty, setDirty, setHeaderDirty, clearDirty };
}
