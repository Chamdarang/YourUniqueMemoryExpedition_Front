import { useState } from "react";
import { PURCHASE_KIND_KEYS, PURCHASE_STATUS_KEYS, getPurchaseKindInfo, getPurchaseStatusInfo } from "../../utils/purchaseUtils";
import type { PurchaseSearchParams, SpotPurchaseSaveRequest } from "../../types/purchase";
import type { PurchaseKind, PurchaseStatus } from "../../types/enums";
import type { SpotResponse } from "../../types/spot";

interface Props {
    spots: SpotResponse[];
    onSearch: (params: PurchaseSearchParams) => void;
    onSave: (data: SpotPurchaseSaveRequest & { spotUserId: number }, editingId: number | null) => Promise<void>;
    isAdding: boolean;
    setIsAdding: (val: boolean) => void;
    editingId: number | null;
    setEditingId: (id: number | null) => void;
    formPurchase: SpotPurchaseSaveRequest & { spotUserId: number };
    setFormPurchase: (val: any) => void;
}

export default function PurchaseFilter({
                                           spots, onSearch, onSave, isAdding, setIsAdding,
                                           editingId, setEditingId, formPurchase, setFormPurchase
                                       }: Props) {
    const [pFilterDraft, setPFilterDraft] = useState<PurchaseSearchParams>({ keyword: '', category: '' });

    return (
        <div className="space-y-6">
            {/* 상단 액션 바: 새 기념품 추가 버튼 */}
            <div className="flex justify-end">
                <button
                    onClick={() => {
                        setIsAdding(!isAdding);
                        if(isAdding) {
                            setEditingId(null);
                            setFormPurchase({ ...formPurchase, spotUserId: 0, itemName: '' });
                        }
                    }}
                    className={`px-6 py-2 rounded-xl font-black text-sm shadow-md transition-all ${isAdding ? 'bg-gray-200 text-gray-600' : 'bg-pink-600 text-white hover:bg-pink-700'}`}
                >
                    {isAdding ? '닫기' : '+ 새 기념품 추가'}
                </button>
            </div>

            {/* 등록/수정 폼 영역 */}
            {isAdding && (
                <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-200 space-y-4 shadow-inner animate-in slide-in-from-top-2">
                    <h3 className="font-black text-gray-800 flex items-center gap-2">
                        {editingId ? '✏️ 기념품 정보 수정' : '🎁 새 기념품 등록'}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input className="p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none focus:ring-2 focus:ring-pink-400" placeholder="아이템 이름 (필수)" value={formPurchase.itemName} onChange={e => setFormPurchase({...formPurchase, itemName: e.target.value})} />
                        <select className="p-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none" value={formPurchase.spotUserId} onChange={e => setFormPurchase({...formPurchase, spotUserId: Number(e.target.value)})}>
                            <option value="0">📍 장소를 선택하세요</option>
                            {spots.map(s => <option key={s.id} value={s.id}>{s.spotName}</option>)}
                        </select>
                        <select className="p-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none" value={formPurchase.kind} onChange={e => setFormPurchase({...formPurchase, kind: e.target.value as PurchaseKind})}>
                            {PURCHASE_KIND_KEYS.map(k => <option key={k} value={k}>{getPurchaseKindInfo(k).icon} {getPurchaseKindInfo(k).label}</option>)}
                        </select>
                        <select className="p-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none" value={formPurchase.status} onChange={e => setFormPurchase({...formPurchase, status: e.target.value as PurchaseStatus})}>
                            {PURCHASE_STATUS_KEYS.map(s => <option key={s} value={s}>{getPurchaseStatusInfo(s).label}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <input className="p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none" placeholder="카테고리" value={formPurchase.category} onChange={e => setFormPurchase({...formPurchase, category: e.target.value})} />
                        <div className="flex gap-2">
                            <input type="number" className="flex-1 p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none" placeholder="가격" value={formPurchase.price || ''} onChange={e => setFormPurchase({...formPurchase, price: Number(e.target.value)})} />
                            <select className="p-3 bg-white rounded-xl text-xs font-bold border border-gray-200 outline-none" value={formPurchase.currency} onChange={e => setFormPurchase({...formPurchase, currency: e.target.value})}>
                                <option value="JPY">JPY</option><option value="KRW">KRW</option>
                            </select>
                        </div>
                        <input className="p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none" placeholder="메모" value={formPurchase.note} onChange={e => setFormPurchase({...formPurchase, note: e.target.value})} />
                        <button onClick={() => onSave(formPurchase, editingId)} className="bg-pink-600 text-white rounded-xl font-black text-sm hover:bg-pink-700 shadow-lg active:scale-95 transition-transform">{editingId ? '수정 완료' : '저장하기'}</button>
                    </div>
                </div>
            )}

            {/* 검색 바 영역 */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-1">
                    <input className="p-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-pink-500 border-none" placeholder="아이템/메모 검색" value={pFilterDraft.keyword} onChange={e => setPFilterDraft({...pFilterDraft, keyword: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && onSearch(pFilterDraft)} />
                    <select className="p-2.5 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 border-none outline-none" value={pFilterDraft.kind || ""} onChange={e => setPFilterDraft({...pFilterDraft, kind: (e.target.value as PurchaseKind) || undefined})}>
                        <option value="">전체 종류</option>
                        {PURCHASE_KIND_KEYS.map(k => <option key={k} value={k}>{getPurchaseKindInfo(k).label}</option>)}
                    </select>
                    <select className="p-2.5 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 border-none outline-none" value={pFilterDraft.status || ""} onChange={e => setPFilterDraft({...pFilterDraft, status: (e.target.value as PurchaseStatus) || undefined})}>
                        <option value="">전체 상태</option>
                        {PURCHASE_STATUS_KEYS.map(s => <option key={s} value={s}>{getPurchaseStatusInfo(s).label}</option>)}
                    </select>
                    <input className="p-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-pink-500 border-none" placeholder="카테고리 검색" value={pFilterDraft.category} onChange={e => setPFilterDraft({...pFilterDraft, category: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && onSearch(pFilterDraft)} />
                </div>
                <button onClick={() => onSearch(pFilterDraft)} className="px-8 py-2.5 bg-gray-900 text-white rounded-xl font-black text-sm hover:bg-gray-800 transition-all shadow-md">검색</button>
            </div>
        </div>
    );
}