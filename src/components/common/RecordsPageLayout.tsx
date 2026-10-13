import type { ReactNode } from 'react';
import RecordsTabs from './RecordsTabs';

export default function RecordsPageLayout({ active, beforeLeave, children, busy = false }: {
  active: 'SPOT' | 'PURCHASE' | 'GOSHUIN'; beforeLeave?: () => void; children: ReactNode; busy?: boolean;
}) {
  return <div aria-busy={busy} className="relative mx-auto max-w-7xl p-4 pb-20 font-sans md:p-6">
    <header data-records-header className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-6 md:flex-row md:items-center">
      <div><h1 className="text-2xl font-black text-gray-900 md:text-3xl">내 기록</h1><p className="mt-1 text-sm text-gray-500">장소와 여행에서 모은 기념품·고슈인을 관리하세요.</p></div>
      <RecordsTabs active={active} beforeLeave={beforeLeave} />
    </header>
    {children}
  </div>;
}
