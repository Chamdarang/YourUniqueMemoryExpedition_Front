import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useFeedback } from './useFeedback';
import { ACCOUNT_PROFILE_UPDATED_EVENT } from '../../utils/accountProfile';
import PageVisitGuide, { type PageGuideId } from './PageVisitGuide';

export default function Layout() {
  const navigate = useNavigate();
  const mobileNav = useRef<HTMLElement>(null);
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty('--yume-mobile-nav-height', `${mobileNav.current?.getBoundingClientRect().height || 0}px`);
    const observer = new ResizeObserver(update);
    if (mobileNav.current) observer.observe(mobileNav.current);
    update();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--yume-mobile-nav-height'); };
  }, []);
  const location = useLocation();
  const username = localStorage.getItem('username');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('nickname') || username || '여행자');
  const { confirm } = useFeedback();

  useEffect(() => {
    const refreshNickname = (event: Event) => {
      const nickname = (event as CustomEvent<{ nickname?: string }>).detail?.nickname;
      setDisplayName(nickname || localStorage.getItem('nickname') || localStorage.getItem('username') || '여행자');
    };
    window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshNickname);
    window.addEventListener('storage', refreshNickname);
    return () => {
      window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshNickname);
      window.removeEventListener('storage', refreshNickname);
    };
  }, []);

  const handleLogout = async () => {
    if (await confirm({ title: '로그아웃', message: '현재 계정에서 로그아웃할까요?', confirmLabel: '로그아웃' })) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('username');
      localStorage.removeItem('nickname');
      localStorage.removeItem('tokenExpiry');
      navigate('/login', { replace: true });
    }
  };

  const openPageGuide = () => window.dispatchEvent(new Event('yume:open-page-guide'));

  const menus = [
    { name: '홈', path: '/', icon: '🏠' },
    { name: '탐색', path: '/map', icon: '🗺️' },
    { name: '내 여행', path: '/plans', icon: '✈️' },
    { name: '하루 코스', path: '/days', icon: '📅' },
    { name: '장소 보관함', path: '/spots', icon: '⭐' },
  ];

  const pageGuideId: PageGuideId | null = location.pathname === '/map' ? 'explore'
    : location.pathname === '/plans' || location.pathname === '/plans/create' ? 'plans'
        : /^\/plans\/[^/]+$/.test(location.pathname) ? 'plan-detail'
          : location.pathname === '/days' ? 'days'
            : /^\/days\/[^/]+$/.test(location.pathname) ? 'day-detail'
              : location.pathname === '/spots' ? 'spots'
                : /^\/spots\/[^/]+$/.test(location.pathname) ? 'spot-detail'
                  : null;

  return (
      // ✅ [수정 1] PC에서는 가로(row), 모바일에서는 세로(col) 배치
      <div className="flex flex-col md:flex-row w-full h-full bg-white overflow-hidden">

        {/* ---------------------------------------------------------
          🖥️ PC용 사이드바 (왼쪽 고정)
      --------------------------------------------------------- */}
        {/* ✅ [수정 2] h-screen 대신 h-full 사용 (부모 높이 상속) */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-full shrink-0">

          {/* 로고 영역 */}
          <div className="p-6 border-b border-gray-100">
            <Link to="/" className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">✈️</span>
                <span className="font-black text-xl text-blue-600 tracking-widest font-sans">
                YUME
              </span>
              </div>
              <span className="text-[0.65rem] text-blue-400 font-medium tracking-wide uppercase">
              Your Unique Memory Expedition
            </span>
            </Link>
          </div>

          {/* 메뉴 영역 */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {menus.map((menu) => (
                <NavLink
                    key={menu.name}
                    to={menu.path}
                    data-guide-target={menu.path === '/' ? 'nav-home' : `nav-${menu.path.slice(1) === 'map' ? 'explore' : menu.path.slice(1)}`}
                    className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 rounded-xl transition font-medium ${
                            isActive
                                ? 'bg-blue-50 text-blue-600'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`
                    }
                >
                  <span className="text-xl">{menu.icon}</span>
                  {menu.name}
                </NavLink>
            ))}
          </nav>

          {/* 하단 프로필 & 로그아웃 */}
          <div className="p-4 border-t border-gray-100 mt-auto">
            <button
              type="button"
              onClick={openPageGuide}
              className="mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-blue-700"
            >
              <span aria-hidden="true">ⓘ</span>가이드 다시보기
            </button>
            <div className="flex min-w-0 items-center gap-3 px-2 py-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-600">
                {displayName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{displayName}</p>
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <Link to="/account" className="text-blue-600 hover:text-blue-700 hover:underline">
                    계정 관리
                  </Link>
                  <span aria-hidden="true" className="h-3 border-l border-slate-300" />
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="text-slate-500 transition hover:text-rose-600"
                  >
                    로그아웃
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>


        {/* ---------------------------------------------------------
          📱 모바일용 상단 헤더
      --------------------------------------------------------- */}
        <header className="md:hidden bg-white border-b border-gray-200 p-4 sticky top-0 z-10 flex justify-between items-center shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">✈️</span>
            <span className="font-black text-lg text-blue-600 tracking-widest">YUME</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={openPageGuide} aria-label="현재 화면 가이드 다시보기" className="min-h-11 min-w-11 rounded-lg text-sm text-slate-600">도움말</button>
            <Link to="/account" className="max-w-20 truncate text-sm font-medium text-blue-600">{displayName}</Link>
            <button onClick={() => void handleLogout()} className="text-sm text-gray-500">로그아웃</button>
          </div>
        </header>


        {/* ---------------------------------------------------------
          📄 메인 컨텐츠 영역 (Outlet)
      --------------------------------------------------------- */}
        {/* ✅ [수정 3] overflow-y-auto 추가: 지도 외의 일반 페이지(목록 등)에서 스크롤 가능하게 함 */}
        <main className="flex-1 w-full h-full relative overflow-y-auto overflow-x-hidden">
          <Outlet />
          {pageGuideId && <PageVisitGuide key={pageGuideId} pageId={pageGuideId} />}
        </main>


        {/* ---------------------------------------------------------
          📱 모바일용 하단 탭바
      --------------------------------------------------------- */}
        {/* ✅ [수정 4] fixed 제거하고 shrink-0 사용 (Flex 레이아웃 흐름 따름) */}
        <nav ref={mobileNav} aria-label="주요 메뉴" className="md:hidden shrink-0 bg-white border-t border-gray-200 flex justify-around p-2 z-50 safe-area-bottom">
          {menus.map((menu) => (
              <NavLink
                  key={menu.name}
                  to={menu.path}
                  data-guide-target={menu.path === '/' ? 'nav-home' : `nav-${menu.path.slice(1) === 'map' ? 'explore' : menu.path.slice(1)}`}
                  className={({ isActive }) =>
                      `flex flex-col items-center p-2 rounded-lg ${
                          isActive ? 'text-blue-600' : 'text-gray-400'
                      }`
                  }
              >
                <span className="text-2xl mb-1">{menu.icon}</span>
                <span className="text-[10px] font-medium">{menu.name}</span>
              </NavLink>
          ))}

        </nav>

      </div>
  );
}
