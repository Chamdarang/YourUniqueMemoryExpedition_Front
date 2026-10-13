import { useId, type ReactNode } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

export default function GoshuinDialog({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const titleId = useId();
  const ref = useDialogFocus(true, onClose);
  return <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-gray-900/35 p-0 md:items-center md:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
      className={`flex max-h-[100dvh] w-full flex-col bg-white md:max-h-[85dvh] md:rounded-2xl ${wide ? 'md:max-w-3xl' : 'md:max-w-xl'}`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
        <h2 id={titleId} className="text-lg font-bold text-gray-900">{title}</h2>
        <button type="button" aria-label="닫기" className="yume-icon-button" onClick={onClose}>✕</button>
      </header>
      <div className="overflow-y-auto p-5 pb-8">{children}</div>
    </div>
  </div>;
}
