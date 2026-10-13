import { useEffect, useId, useRef, type ReactNode } from 'react';

/** An in-page workspace: normal page scrolling and keyboard navigation stay available. */
export default function GoshuinPanel({ title, onClose, children, busy = false, returnFocusId }: {
  title: string; onClose: () => void; children: ReactNode; busy?: boolean; returnFocusId?: string;
}) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const returnId = useRef(returnFocusId);
  useEffect(() => {
    const panel = ref.current;
    const focusId = returnId.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      panel?.scrollIntoView({ block: 'nearest' });
      (panel?.querySelector<HTMLElement>('[data-dialog-initial-focus]') || panel)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      requestAnimationFrame(() => {
        const target = focusId ? document.getElementById(focusId) : opener;
        if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
      });
    };
  }, []);
  return <section ref={ref} aria-labelledby={titleId} aria-busy={busy} tabIndex={-1}
    className="min-w-0 scroll-mt-4 rounded-2xl border border-blue-200 bg-white">
    <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 md:px-5">
      <h3 id={titleId} className="break-words pt-2 text-lg font-bold text-gray-900">{title}</h3>
      <button type="button" disabled={busy} aria-label="닫기" className="yume-icon-button shrink-0" onClick={onClose}>✕</button>
    </header>
    <div className="p-4 md:p-5">{children}</div>
  </section>;
}
