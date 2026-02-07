import React from 'react';
import type { SpotPurchaseSaveRequest, SpotPurchaseResponse } from '../../types/purchase';
import type { PurchaseStatus, PurchaseKind } from '../../types/enums';

interface SpotPurchaseCardProps {
    mode: 'add' | 'edit' | 'view';
    data?: SpotPurchaseResponse;
    form: SpotPurchaseSaveRequest;
    onChange: (updates: Partial<SpotPurchaseSaveRequest>) => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete?: (id: number) => void;
    onEditMode?: (data: SpotPurchaseResponse) => void;
    getStatusInfo: (status: PurchaseStatus) => { label: string; color: string };
}

export default function SpotPurchaseCard({
                                             mode, data, form, onChange, onSave, onCancel, onDelete, onEditMode, getStatusInfo
                                         }: SpotPurchaseCardProps) {

    if (mode === 'add' || mode === 'edit') {
        const isAdd = mode === 'add';
        return (
            <div className={`p-5 border-2 rounded-[1.5rem] shadow-lg animate-in zoom-in-95 duration-200 ${
                isAdd ? 'bg-blue-50/50 border-blue-200 border-dashed' : 'bg-white border-blue-400 ring-2 ring-blue-50'
            }`}>
                <div className="space-y-4">
                    <input
                        className="w-full p-1 text-lg font-black border-b-2 border-blue-500 outline-none bg-transparent text-blue-500 placeholder:text-blue-300"
                        placeholder={isAdd ? "무엇을 사셨나요?" : "아이템 이름"}
                        value={form.itemName}
                        onChange={e => onChange({ itemName: e.target.value })}
                        autoFocus
                    />

                    <div className="flex gap-2 min-w-0">
                        <select
                            className="w-28 p-2 bg-white rounded-xl text-xs font-bold shadow-sm outline-none border border-gray-100 cursor-pointer"
                            value={form.kind}
                            onChange={e => onChange({ kind: e.target.value as PurchaseKind })}
                        >
                            <option value="SOUVENIR">🎁 기념품</option>
                            <option value="GOSHUIN">🧧 고슈인</option>
                            <option value="GOSHUINCHO">📒 고슈인첩</option>
                            <option value="STAMP">📔 스탬프</option>
                            <option value="TICKET">🎟️ 티켓</option>
                            <option value="FOOD_ITEM">🍱 식료품</option>
                            <option value="OTHER">📍 기타</option>
                        </select>
                        <input
                            className="flex-1 min-w-0 p-2 bg-white rounded-xl text-xs shadow-sm outline-none border border-gray-100"
                            placeholder="카테고리"
                            value={form.category}
                            onChange={e => onChange({ category: e.target.value })}
                        />
                    </div>

                    <div className="space-y-3">
                        {/* 상태 선택 */}
                        <select
                            className="w-full p-2 bg-white rounded-xl text-[11px] font-black shadow-sm outline-none border border-blue-100 text-blue-600 cursor-pointer"
                            value={form.status}
                            onChange={e => onChange({ status: e.target.value as PurchaseStatus })}
                        >
                            <option value="WANT">🥺 사고 싶음</option>
                            <option value="AVAILABLE">🏷️ 판매 중</option>
                            <option value="ACQUIRED">🎁 구매 완료</option>
                            <option value="SKIPPED">❌ 패스함</option>
                            <option value="UNAVAILABLE">🚫 품절/없음</option>
                        </select>

                        {/* 가격, 통화, 수량 - 충분한 너비 확보 */}
                        <div className="flex gap-2 min-w-0">
                            <input
                                className="flex-[1.5] min-w-0 p-2 bg-white rounded-xl text-xs font-bold shadow-sm border border-gray-100 outline-none"
                                type="number"
                                placeholder="가격 입력"
                                value={form.price || ''}
                                onChange={e => onChange({ price: Number(e.target.value) })}
                            />
                            <select
                                className="w-16 p-2 bg-white rounded-xl text-[10px] font-bold shadow-sm border border-gray-100 outline-none cursor-pointer"
                                value={form.currency}
                                onChange={e => onChange({ currency: e.target.value })}
                            >
                                <option value="JPY">JPY</option>
                                <option value="KRW">KRW</option>
                                <option value="USD">USD</option>
                            </select>
                            <div className="flex items-center gap-1 bg-gray-50 px-2 rounded-xl border border-gray-100">
                                <span className="text-[10px] font-bold text-gray-400">수량</span>
                                <input
                                    className="w-8 bg-transparent text-xs text-center font-black outline-none"
                                    type="number"
                                    value={form.quantity}
                                    onChange={e => onChange({ quantity: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>

                    <textarea
                        className="w-full p-3 bg-white rounded-2xl text-xs shadow-sm border border-gray-100 outline-none resize-none"
                        rows={2}
                        value={form.note}
                        onChange={e => onChange({ note: e.target.value })}
                        placeholder="메모를 입력하세요."
                    />

                    <div className="flex gap-2">
                        <button onClick={onSave} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-black text-sm shadow-md active:scale-95 transition-all">저장</button>
                        <button onClick={onCancel} className="flex-1 bg-gray-100 text-gray-400 py-2.5 rounded-xl font-bold text-sm">취소</button>
                    </div>
                </div>
            </div>
        );
    }

    if (!data) return null;
    return (
        <div className="p-6 bg-white border border-gray-100 rounded-[2rem] transition-all relative group overflow-hidden hover:shadow-xl">
            <div className="flex justify-between items-start mb-4">
                <span className={`text-[10px] font-black px-3 py-1 rounded-full border tracking-widest ${getStatusInfo(data.status).color}`}>
                    {getStatusInfo(data.status).label}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => onEditMode?.(data)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">✏️</button>
                    <button onClick={() => onDelete?.(data.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-colors">🗑️</button>
                </div>
            </div>
            <h5 className="font-black text-gray-800 text-xl leading-tight truncate mb-1">{data.itemName}</h5>
            <div className="flex items-center gap-1.5 mb-3">
                <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md uppercase">{data.kind}</span>
                {data.category && <span className="text-[10px] font-bold text-gray-400">• {data.category}</span>}
            </div>
            <div className="flex items-center gap-2 border-t border-gray-50 pt-4 mt-2">
                <p className="text-base font-black text-blue-600 font-mono">{data.price.toLocaleString()}{data.currency}</p>
                <span className="text-gray-300">|</span>
                <p className="text-sm text-gray-400 font-bold">{data.quantity}개</p>
            </div>
            {data.note && (
                <div className="mt-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100/50">
                    <p className="text-[11px] text-gray-500 italic leading-relaxed break-keep">"{data.note}"</p>
                </div>
            )}
        </div>
    );
}