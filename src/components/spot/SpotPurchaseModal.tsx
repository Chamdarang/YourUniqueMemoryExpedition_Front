import { useState, useEffect } from "react";

// Types
import type { SpotPurchaseResponse, SpotPurchaseSaveRequest } from "../../types/purchase";
import type { PurchaseKind, PurchaseStatus } from "../../types/enums";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (req: SpotPurchaseSaveRequest) => Promise<void>;
  initialData?: SpotPurchaseResponse | null;
}

export default function SpotPurchaseModal({ isOpen, onClose, onSave, initialData }: Props) {

  // ----------------------------------------------------------------
  // 🧠 State
  // ----------------------------------------------------------------
  const [form, setForm] = useState<SpotPurchaseSaveRequest>({
    kind: 'SOUVENIR',
    category: '',
    itemName: '',
    price: 0,
    currency: 'JPY',
    status: 'WANT',
    quantity: 1,
    acquiredDate: '',
    note: ''
  });

  // ----------------------------------------------------------------
  // ⚙️ Effects (초기화 로직)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      const today = new Date().toISOString().split('T')[0];
      if (initialData) {
        setForm({
          kind: initialData.kind,
          category: initialData.category || '',
          itemName: initialData.itemName,
          price: initialData.price,
          currency: initialData.currency,
          status: initialData.status,
          quantity: initialData.quantity || 1,
          acquiredDate: initialData.acquiredDate ? initialData.acquiredDate.toString() : today,
          note: initialData.note || ''
        });
      } else {
        // 새 항목 추가 시 초기값
        setForm({
          kind: 'SOUVENIR',
          category: '',
          itemName: '',
          price: 0,
          currency: 'JPY',
          status: 'WANT',
          quantity: 1,
          acquiredDate: today,
          note: ''
        });
      }
    }
  }, [isOpen, initialData]);

  // ----------------------------------------------------------------
  // 🎮 Handlers
  // ----------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
    onClose();
  };

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
        <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 overflow-y-auto max-h-[90vh]">

          {/* 헤더 */}
          <h2 className="text-xl font-bold mb-5 text-gray-800 flex items-center gap-2">
            {initialData ? '✏️ 구매 내역 수정' : '🛍️ 새 물품 추가'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 1. 종류 & 상태 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">종류</label>
                <select
                    className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.kind}
                    onChange={e => setForm({...form, kind: e.target.value as PurchaseKind})}
                >
                  <option value="SOUVENIR">🎁 기념품</option>
                  <option value="GOSHUIN">🙏 고슈인</option>
                  <option value="TICKET">🎫 티켓</option>
                  <option value="FOOD_ITEM">🍱 식품</option>
                  <option value="STAMP">💮 스탬프</option>
                  <option value="GOSHUINCHO">📜 고슈인초</option>
                  <option value="OTHER">📍 기타</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">상태</label>
                <select
                    className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.status}
                    onChange={e => setForm({...form, status: e.target.value as PurchaseStatus})}
                >
                  <option value="WANT">🥺 사고 싶음</option>
                  <option value="AVAILABLE">🏷️ 판매 중</option>
                  <option value="ACQUIRED">🎁 구매 완료</option>
                  <option value="SKIPPED">❌ 패스함</option>
                  <option value="UNAVAILABLE">🚫 품절/없음</option>
                  <option value="UNKNOWN">❓ 상태 미상</option>
                </select>
              </div>
            </div>

            {/* 2. 물품명 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">물품명</label>
              <input
                  required
                  className="w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  placeholder="예) 녹차 킷캣, 금각사 부적"
                  value={form.itemName}
                  onChange={e => setForm({...form, itemName: e.target.value})}
              />
            </div>

            {/* 3. 가격 & 통화 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-500 mb-1">가격</label>
                <input
                    type="number"
                    min="0"
                    className="w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-right font-mono"
                    value={form.price}
                    onChange={e => setForm({...form, price: Number(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">통화</label>
                <select
                    className="w-full p-2.5 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 text-center"
                    value={form.currency}
                    onChange={e => setForm({...form, currency: e.target.value})}
                >
                  <option value="JPY">¥ JPY</option>
                  <option value="KRW">₩ KRW</option>
                  <option value="USD">$ USD</option>
                </select>
              </div>
            </div>

            {/* 4. 수량 & 날짜 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">수량</label>
                <div className="flex items-center border rounded-lg overflow-hidden bg-white">
                  <button type="button" onClick={() => setForm(f => ({...f, quantity: Math.max(1, f.quantity - 1)}))} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold">-</button>
                  <input
                      type="number"
                      min="1"
                      className="w-full p-2 text-center outline-none"
                      value={form.quantity}
                      onChange={e => setForm({...form, quantity: Math.max(1, Number(e.target.value))})}
                  />
                  <button type="button" onClick={() => setForm(f => ({...f, quantity: f.quantity + 1}))} className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold">+</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">날짜</label>
                <input
                    type="date"
                    className="w-full p-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                    value={form.acquiredDate}
                    onChange={e => setForm({...form, acquiredDate: e.target.value})}
                />
              </div>
            </div>

            {/* 5. 메모 */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">메모</label>
              <textarea
                  className="w-full p-3 border rounded-lg outline-none resize-none focus:ring-2 focus:ring-blue-500 text-sm"
                  rows={2}
                  placeholder="특이사항이나 선물 줄 사람..."
                  value={form.note}
                  onChange={e => setForm({...form, note: e.target.value})}
              />
            </div>

            {/* 6. 하단 버튼 */}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-xl transition">
                취소
              </button>
              <button type="submit" className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-200">
                {initialData ? '수정 완료' : '추가하기'}
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}