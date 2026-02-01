import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// API
import { createPlan } from '../api/planApi';

// Types
import type { PlanCreateRequest } from '../types/plan';

export default function PlanCreatePage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<PlanCreateRequest>({
    planName: '',
    planStartDate: '',
    planEndDate: '',
    planDays: 4, // 기본 4일
    planMemo: '',
  });

  // ----------------------------------------------------------------
  // 📅 날짜 계산 헬퍼 함수
  // ----------------------------------------------------------------

  // 특정 날짜에 일수(Days)를 더해 종료일 계산
  const addDaysToDate = (dateStr: string, days: number): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    date.setDate(date.getDate() + (days - 1));
    return date.toISOString().split('T')[0];
  };

  // 두 날짜 사이의 일수(Days) 계산 (시작일 포함)
  const calculateDuration = (startStr: string, endStr: string): number => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // ----------------------------------------------------------------
  // 🎮 핸들러
  // ----------------------------------------------------------------

  // 1. 시작일 변경 시 -> 기간은 유지하고, 종료일을 뒤로 미룸
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    const newEndDate = addDaysToDate(newStartDate, form.planDays);
    setForm({
      ...form,
      planStartDate: newStartDate,
      planEndDate: newEndDate
    });
  };

  // 2. 종료일 변경 시 -> 기간(Days)을 다시 계산
  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value;
    const newDuration = calculateDuration(form.planStartDate, newEndDate);

    // 종료일이 시작일보다 빠르면 1일로 보정
    const validDuration = newDuration > 0 ? newDuration : 1;

    setForm({
      ...form,
      planEndDate: newEndDate,
      planDays: validDuration
    });
  };

  // 3. 기간(Days) 변경 시 -> 시작일 기준으로 종료일을 다시 계산
  const handleDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDays = parseInt(e.target.value) || 1;
    const newEndDate = addDaysToDate(form.planStartDate, newDays);

    setForm({
      ...form,
      planDays: newDays,
      planEndDate: newEndDate
    });
  };

  // 4. 일반 텍스트 변경 (제목, 메모)
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // 5. 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.planDays <= 0) {
      alert('여행 기간은 최소 1일 이상이어야 합니다.');
      return;
    }

    try {
      await createPlan(form);
      alert(`'${form.planName}' 여행이 생성되었습니다! ✈️`);
      navigate('/plans');
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) alert(err.message);
      else alert('생성 실패');
    }
  };

  return (
      <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">새 여행 떠나기 🎒</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 여행 이름 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">여행 제목</label>
            <input
                name="planName"
                type="text"
                required
                value={form.planName}
                placeholder="예) 제주도 힐링 여행"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                onChange={handleTextChange}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* 시작일 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">가는 날</label>
              <input
                  name="planStartDate"
                  type="date"
                  value={form.planStartDate}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:border-blue-500"
                  onChange={handleStartDateChange}
              />
            </div>

            {/* 기간 (자동 계산 + 직접 입력 가능) */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">기간 (일)</label>
              <div className="relative">
                <input
                    name="planDays"
                    type="number"
                    min="1"
                    value={form.planDays}
                    className="w-full px-3 py-2 border rounded-lg outline-none focus:border-blue-500 text-center font-bold text-blue-600"
                    onChange={handleDaysChange}
                />
                <span className="absolute right-3 top-2 text-gray-400 text-sm">일간</span>
              </div>
            </div>

            {/* 종료일 */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">오는 날</label>
              <input
                  name="planEndDate"
                  type="date"
                  value={form.planEndDate}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:border-blue-500"
                  onChange={handleEndDateChange}
              />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">간단 메모</label>
            <textarea
                name="planMemo"
                rows={3}
                value={form.planMemo}
                placeholder="여행 테마나 계획을 적어보세요."
                className="w-full px-4 py-2 border rounded-lg outline-none resize-none"
                onChange={handleTextChange}
            />
          </div>

          <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition transform active:scale-95"
          >
            여행 생성하기
          </button>
        </form>
      </div>
  );
}