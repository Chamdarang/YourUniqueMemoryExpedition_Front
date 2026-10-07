import { useState } from "react";
import { PURCHASE_KIND_KEYS, PURCHASE_STATUS_KEYS, getPurchaseKindInfo, getPurchaseStatusInfo } from "../../utils/purchaseUtils";
import type { PurchaseSearchParams, SpotPurchaseSaveRequest } from "../../types/purchase";
import type { PurchaseKind, PurchaseStatus } from "../../types/enums";
import PurchaseForm from './PurchaseForm';

interface Props {
    selectedSpotName?: string;
    onSearch: (params: PurchaseSearchParams) => void;
    onSave: (data: SpotPurchaseSaveRequest & { spotUserId: number }, editingId: number | null) => Promise<void>;
    isAdding: boolean;
    setIsAdding: (val: boolean) => void;
    editingId: number | null;
    setEditingId: (id: number | null) => void;
    formPurchase: SpotPurchaseSaveRequest & { spotUserId: number };
    setFormPurchase: React.Dispatch<React.SetStateAction<SpotPurchaseSaveRequest & { spotUserId: number }>>;
}

export default function PurchaseFilter({
                                           selectedSpotName, onSearch, onSave, isAdding, setIsAdding,
                                           editingId, setEditingId, formPurchase, setFormPurchase
                                       }: Props) {
    const [pFilterDraft, setPFilterDraft] = useState<PurchaseSearchParams>({ keyword: '', category: '' });

    const closeForm = () => {
        setIsAdding(false);
        setEditingId(null);
        setFormPurchase({ itemName: '', spotUserId: 0, kind: 'SOUVENIR', category: '', price: 0, currency: 'JPY', status: 'WANT', quantity: 1, acquiredDate: new Date().toISOString().split('T')[0], note: '' });
    };

    return (
        <div className="space-y-6">
            {/* 상단 액션 바: 새 기념품 추가 버튼 */}
            <div className="flex justify-end">
                <button
                    onClick={() => isAdding ? closeForm() : setIsAdding(true)}
                    className={`px-6 py-2 rounded-xl font-black text-sm shadow-md transition-all ${isAdding ? 'bg-gray-200 text-gray-600' : 'bg-pink-600 text-white hover:bg-pink-700'}`}
                >
                    {isAdding ? '닫기' : '+ 새 기념품 추가'}
                </button>
            </div>

            {/* 등록/수정 폼 영역 */}
            {isAdding && <PurchaseForm key={editingId ?? 'new'} editing={editingId !== null} selectSpot spotName={selectedSpotName}
                value={formPurchase} onChange={updates => setFormPurchase(current => ({ ...current, ...updates }))}
                onSave={value => onSave({ ...value, spotUserId: value.spotUserId || 0 }, editingId)}
                onCancel={closeForm} />}

            {/* 검색 바 영역 */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-1">
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="purchase-search-keyword">기념품·메모 검색</label>
                        <input id="purchase-search-keyword" className="w-full p-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-pink-500 border-none" placeholder="아이템/메모 검색" value={pFilterDraft.keyword} onChange={e => setPFilterDraft({...pFilterDraft, keyword: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && onSearch(pFilterDraft)} />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="purchase-filter-kind">종류 필터</label>
                        <select id="purchase-filter-kind" className="w-full p-2.5 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 border-none outline-none" value={pFilterDraft.kind || ""} onChange={e => setPFilterDraft({...pFilterDraft, kind: (e.target.value as PurchaseKind) || undefined})}>
                            <option value="">전체 종류</option>
                            {PURCHASE_KIND_KEYS.map(k => <option key={k} value={k}>{getPurchaseKindInfo(k).label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="purchase-filter-status">상태 필터</label>
                        <select id="purchase-filter-status" className="w-full p-2.5 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 border-none outline-none" value={pFilterDraft.status || ""} onChange={e => setPFilterDraft({...pFilterDraft, status: (e.target.value as PurchaseStatus) || undefined})}>
                            <option value="">전체 상태</option>
                            {PURCHASE_STATUS_KEYS.map(s => <option key={s} value={s}>{getPurchaseStatusInfo(s).label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-semibold text-gray-700" htmlFor="purchase-filter-category">카테고리 필터</label>
                        <input id="purchase-filter-category" className="w-full p-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-pink-500 border-none" placeholder="카테고리 검색" value={pFilterDraft.category} onChange={e => setPFilterDraft({...pFilterDraft, category: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && onSearch(pFilterDraft)} />
                    </div>
                </div>
                <button onClick={() => onSearch(pFilterDraft)} className="px-8 py-2.5 bg-gray-900 text-white rounded-xl font-black text-sm hover:bg-gray-800 transition-all shadow-md">검색</button>
            </div>
        </div>
    );
}
