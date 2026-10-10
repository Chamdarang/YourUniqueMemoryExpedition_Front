import { useEffect, useRef, useState } from 'react';
import { SAVE_STATUS_EVENT, type SaveStatus } from '../../utils/saveStatus';

interface Props {
  isDirty?: boolean;
  className?: string;
  statusOverride?: SaveStatus;
}

export default function SaveStatusIndicator({ isDirty = false, className = '', statusOverride }: Props) {
  const [trackedStatus, setStatus] = useState<SaveStatus>('IDLE');
  const savedTimer = useRef<number | null>(null);
  const status = statusOverride ?? trackedStatus;

  useEffect(() => {
    const updateStatus = (event: Event) => {
      const nextStatus = (event as CustomEvent<SaveStatus>).detail;
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
      setStatus(nextStatus);
      if (nextStatus === 'SAVED') {
        savedTimer.current = window.setTimeout(() => {
          setStatus('IDLE');
          savedTimer.current = null;
        }, 1600);
      }
    };
    window.addEventListener(SAVE_STATUS_EVENT, updateStatus);
    return () => {
      window.removeEventListener(SAVE_STATUS_EVENT, updateStatus);
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    };
  }, []);

  if (status === 'IDLE' && !isDirty) return null;

  const label = status === 'SAVING'
    ? '저장 중…'
    : status === 'ERROR'
      ? '저장 실패'
      : isDirty
        ? '저장되지 않은 변경사항'
        : '저장 완료';
  const dotClass = status === 'SAVING'
    ? 'bg-slate-400 animate-pulse'
    : status === 'ERROR'
      ? 'bg-red-500'
      : isDirty
        ? 'bg-amber-500'
        : 'bg-emerald-500';
  const textClass = status === 'ERROR'
    ? 'text-red-600'
    : isDirty && status !== 'SAVING'
      ? 'text-amber-700'
      : status === 'SAVING'
        ? 'text-slate-500'
        : 'text-emerald-700';

  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${textClass} ${className}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
