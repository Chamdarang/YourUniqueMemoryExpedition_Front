import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useFeedback } from '../components/common/useFeedback';

export function useGoshuinDraftGuard(dirty: boolean, busy: boolean) {
  const { confirm } = useFeedback();
  const leaving = useRef(false);
  const prompting = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !leaving.current && (dirty || busy)
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => {
    if (!dirty && !busy) return;
    const protect = (event: BeforeUnloadEvent) => { if (!leaving.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, busy]);
  useEffect(() => {
    if (blocker.state !== 'blocked' || prompting.current) return;
    if (busy) { blocker.reset(); return; }
    prompting.current = true;
    void confirm({ title: '입력 내용', message: '저장하지 않은 변경사항을 버리고 이동할까요?', confirmLabel: '이동' }).then(proceed => {
      prompting.current = false;
      if (proceed) { leaving.current = true; blocker.proceed(); }
      else blocker.reset();
    });
  }, [blocker, busy, confirm]);
  // Mark a successful save or an explicitly confirmed cancellation before navigating.
  return () => { leaving.current = true; };
}
