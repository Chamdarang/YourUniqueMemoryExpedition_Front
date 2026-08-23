import { useState } from 'react';
import { enforceFourDigitDateYear, limitDateYear } from '../../utils/timeUtils';

// ----------------------------------------------------------------
// 📝 타입 정의
// ----------------------------------------------------------------

// 탭 상태 타입 (부모와 공유)
export type PlanStatus = 'ALL' | 'UPCOMING' | 'PAST';

// 검색 조건 타입 (서버 보낼 것들)
export interface SearchParams {
  startDate: string;
  endDate: string;
  selectedMonths: number[];
}

interface Props {
  status: PlanStatus;              // 현재 탭 상태
  onStatusChange: (s: PlanStatus) => void; // 탭 변경 핸들러
  onSearch: (params: SearchParams) => void; // 검색 핸들러
}

// ----------------------------------------------------------------
// 🚀 컴포넌트
// ----------------------------------------------------------------

export default function PlanFilter({ status, onStatusChange, onSearch }: Props) {
  // 로컬 상태: 검색 조건 (검색 버튼 클릭 시 상위로 전달)
  const [localParams, setLocalParams] = useState<SearchParams>({
    startDate: '',
    endDate: '',
    selectedMonths: [],
  });

  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // 월 선택 토글
  const toggleMonth = (month: number) => {
    const current = localParams.selectedMonths;
    const newMonths = current.includes(month)
        ? current.filter((m) => m !== month)
        : [...current, month];
    setLocalParams({ ...localParams, selectedMonths: newMonths });
  };

  return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* 상단: 탭 & 검색 버튼 */}
        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">

          {/* 1. 탭 (전체/다가오는/지난) */}
          <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
            {(['ALL', 'UPCOMING', 'PAST'] as const).map((tabKey) => {
              const label = { ALL: '전체', UPCOMING: '다가오는', PAST: '지난' };
              const isActive = status === tabKey;
              return (
                  <button
                      key={tabKey}
                      onClick={() => onStatusChange(tabKey)}
                      className={`flex-1 md:flex-none px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                          isActive
                              ? 'bg-white text-blue-600 shadow-sm'
                              : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    {label[tabKey]}
                  </button>
              );
            })}
          </div>

          {/* 2. 우측 컨트롤 (상세조건 토글 + 검색) */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-between">
            <button
                onClick={() => setIsDetailOpen(!isDetailOpen)}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-900 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition"
            >
              📅 상세 조건 {isDetailOpen ? '접기 ▲' : '열기 ▼'}
            </button>

            <button
                onClick={() => onSearch(localParams)}
                className="bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition active:scale-95 whitespace-nowrap"
            >
              검색 적용
            </button>
          </div>
        </div>

        {/* 하단: 상세 검색 옵션 (슬라이드 애니메이션) */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
            isDetailOpen ? 'max-h-125 opacity-100 border-t border-gray-50' : 'max-h-0 opacity-0'
        }`}>
          <div className="p-5 space-y-6 bg-gray-50/50">

            {/* 날짜 범위 */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">여행 기간</label>
              <div className="flex items-center gap-2">
                <input
                    type="date"
                    max="9999-12-31"
                    onInput={enforceFourDigitDateYear}
                    value={localParams.startDate}
                    onChange={(e) => setLocalParams({...localParams, startDate: limitDateYear(e.target.value)})}
                    className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400">~</span>
                <input
                    type="date"
                    max="9999-12-31"
                    onInput={enforceFourDigitDateYear}
                    value={localParams.endDate}
                    onChange={(e) => setLocalParams({...localParams, endDate: limitDateYear(e.target.value)})}
                    className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 월 선택 */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">월별 선택</label>
              <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <button
                        key={month}
                        onClick={() => toggleMonth(month)}
                        className={`py-2 text-sm rounded-lg border transition-all ${
                            localParams.selectedMonths.includes(month)
                                ? 'bg-blue-100 border-blue-200 text-blue-700 font-bold'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      {month}월
                    </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
