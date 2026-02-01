import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';

export default function Layout() {
  const navigate = useNavigate();
  const username = localStorage.getItem('username');

  const handleLogout = () => {
    if (window.confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('username');
      navigate('/login', { replace: true });
    }
  };

  const menus = [
    { name: '홈', path: '/', icon: '🏠' },
    { name: '탐색', path: '/map', icon: '🗺️' },
    { name: '내 여행', path: '/plans', icon: '✈️' },
    { name: '내 계획', path: '/days', icon: '📅' },
    { name: '내 장소', path: '/spots', icon: '⭐' },
  ];

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
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                {username?.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{username}</p>
                <button
                    onClick={handleLogout}
                    className="text-xs text-gray-500 hover:text-red-500 underline"
                >
                  로그아웃
                </button>
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
          <button onClick={handleLogout} className="text-sm text-gray-500">로그아웃</button>
        </header>


        {/* ---------------------------------------------------------
          📄 메인 컨텐츠 영역 (Outlet)
      --------------------------------------------------------- */}
        {/* ✅ [수정 3] overflow-y-auto 추가: 지도 외의 일반 페이지(목록 등)에서 스크롤 가능하게 함 */}
        <main className="flex-1 w-full h-full relative overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>


        {/* ---------------------------------------------------------
          📱 모바일용 하단 탭바
      --------------------------------------------------------- */}
        {/* ✅ [수정 4] fixed 제거하고 shrink-0 사용 (Flex 레이아웃 흐름 따름) */}
        <nav className="md:hidden shrink-0 bg-white border-t border-gray-200 flex justify-around p-2 z-50 safe-area-bottom">
          {menus.map((menu) => (
              <NavLink
                  key={menu.name}
                  to={menu.path}
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