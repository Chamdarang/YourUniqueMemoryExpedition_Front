import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';

export default function RecordsTabs({ active, beforeLeave }: { active: 'SPOT' | 'PURCHASE' | 'GOSHUIN'; beforeLeave?: () => void }) {
  const location = useLocation();
  const key = 'yume:records-route:' + (localStorage.getItem('username') || '') + ':';
  useEffect(() => { sessionStorage.setItem(key + active, location.pathname + location.search); }, [key, active, location.pathname, location.search]);
  return <nav aria-label="내 기록 탭" data-guide-target="spots-tabs" className="yume-segmented w-full sm:w-fit">
    {([{ key: 'SPOT', label: '장소', path: '/spots' }, { key: 'PURCHASE', label: '기념품', path: '/spots?mode=PURCHASE' }, { key: 'GOSHUIN', label: '고슈인', path: '/goshuin-books' }] as const).map(tab =>
      <Link key={tab.key} to={tab.key === active ? tab.path : sessionStorage.getItem(key + tab.key) || tab.path} onClick={beforeLeave} aria-current={active === tab.key ? 'page' : undefined}
        data-guide-target={`spots-tab-${tab.key.toLowerCase()}`} data-guide-state={active === tab.key ? 'selected' : 'unselected'}
        className={`yume-segment ${active === tab.key ? 'bg-white text-blue-600 shadow-sm' : ''}`}>{tab.label}</Link>)}
  </nav>;
}
