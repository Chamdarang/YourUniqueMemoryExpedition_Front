import type { SpotPurchaseSaveRequest, SpotPurchaseResponse } from '../../types/purchase';
import type { PurchaseStatus, PurchaseKind } from '../../types/enums';
// ✅ 유틸리티 함수 임포트
import {
    getPurchaseKindInfo,
    getPurchaseStatusInfo,
    PURCHASE_KIND_KEYS,
    PURCHASE_STATUS_KEYS
} from '../../utils/purchaseUtils';

interface SpotPurchaseCardProps {
    mode: 'add' | 'edit' | 'view';
    data?: SpotPurchaseResponse;
    form: SpotPurchaseSaveRequest;
    onChange: (updates: Partial<SpotPurchaseSaveRequest>) => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete?: (id: number) => void;
    onEditMode?: (data: SpotPurchaseResponse) => void;
}

export default function PurchaseEditCard({
                                         mode, data, form, onChange, onSave, onCancel, onDelete, onEditMode
                                     }: SpotPurchaseCardProps) {

    // ➕ 등록 및 수정 모드
    if (mode === 'add' || mode === 'edit') {
        const isAdd = mode === 'add';

        return (
            <div className={`p-5 border-2 rounded-[1.5rem] shadow-lg animate-in zoom-in-95 duration-200 ${
                isAdd ? 'bg-blue-50/50 border-blue-200 border-dashed' : 'bg-white border-blue-400 ring-2 ring-blue-50'
            }`}>
                <div className="space-y-4">
                    <input
                        className="w-full p-1 text-lg font-black border-b-2 border-blue-500 outline-none bg-transparent text-blue-500 placeholder:text-blue-300"
                        placeholder={isAdd ? "무엇을 사려 하나요?" : "상품명 입력"}
                        value={form.itemName}
                        onChange={e => onChange({ itemName: e.target.value })}
                        autoFocus
                    />

                    <div className="flex gap-2 min-w-0">
                        {/* ✅ [자동화] 종류(Kind) 선택 옵션 적용 */}
                        <select
                            className="w-32 p-2 bg-white rounded-xl text-xs font-bold shadow-sm outline-none border border-gray-100 cursor-pointer"
                            value={form.kind}
                            onChange={e => onChange({ kind: e.target.value as PurchaseKind })}
                        >
                            {PURCHASE_KIND_KEYS.map(key => {
                                const info = getPurchaseKindInfo(key);
                                return <option key={key} value={key}>{info.icon} {info.label}</option>;
                            })}
                        </select>
                        <input
                            className="flex-1 min-w-0 p-2 bg-white rounded-xl text-xs shadow-sm outline-none border border-gray-100"
                            placeholder="카테고리(선택)"
                            value={form.category}
                            onChange={e => onChange({ category: e.target.value })}
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-[10px] font-black text-gray-400 ml-1">상태 설정</label>
                        {/* ✅ [자동화] 상태(Status) 선택 옵션 적용 */}
                        <select
                            className="w-full p-2 bg-white rounded-xl text-[11px] font-black shadow-sm outline-none border border-blue-100 text-blue-600 cursor-pointer"
                            value={form.status}
                            onChange={e => onChange({ status: e.target.value as PurchaseStatus })}
                        >
                            {PURCHASE_STATUS_KEYS.map(key => {
                                const info = getPurchaseStatusInfo(key);
                                return <option key={key} value={key}>{info.label}</option>;
                            })}
                        </select>

                        <div className="flex gap-2 min-w-0">
                            <div className="flex-[1.5] space-y-1">
                                <label className="block text-[10px] font-black text-gray-400 ml-1">가격</label>
                                <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                                    <input
                                        className="w-full p-2 text-xs font-bold outline-none"
                                        type="number"
                                        placeholder="0"
                                        value={form.price || ''}
                                        onChange={e => onChange({ price: Number(e.target.value) })}
                                    />
                                    <select
                                        className="p-2 text-[10px] font-bold bg-gray-50 outline-none cursor-pointer border-l border-gray-100"
                                        value={form.currency}
                                        onChange={e => onChange({ currency: e.target.value })}
                                    >
                                        <option value="JPY">JPY</option>
                                        <option value="KRW">KRW</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex-1 space-y-1">
                                <label className="block text-[10px] font-black text-gray-400 ml-1">수량</label>
                                <input
                                    className="w-full p-2 bg-white rounded-xl text-xs font-black shadow-sm border border-gray-100 outline-none text-center"
                                    type="number"
                                    value={form.quantity}
                                    onChange={e => onChange({ quantity: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-[10px] font-black text-gray-400 ml-1">메모</label>
                        <textarea
                            className="w-full p-3 bg-white rounded-2xl text-xs shadow-sm border border-gray-100 outline-none resize-none"
                            rows={2}
                            value={form.note}
                            onChange={e => onChange({ note: e.target.value })}
                            placeholder="상세 정보를 입력하세요."
                        />
                    </div>

                    <div className="flex gap-2">
                        <button onClick={onSave} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black text-sm shadow-md active:scale-95 transition-all">등록하기</button>
                        <button onClick={onCancel} className="flex-1 bg-gray-100 text-gray-400 py-3 rounded-xl font-bold text-sm">취소</button>
                    </div>
                </div>
            </div>
        );
    }

    // 👀 조회 모드
    if (!data) return null;

    const kindInfo = getPurchaseKindInfo(data.kind);
    const statusInfo = getPurchaseStatusInfo(data.status);

    return (
        <div className="p-6 bg-white border border-gray-100 rounded-[2rem] transition-all relative group overflow-hidden hover:shadow-xl">
            <div className="flex justify-between items-start mb-4">
                <span className={`text-[10px] font-black px-3 py-1 rounded-full border tracking-widest ${statusInfo.color}`}>
                    {statusInfo.label}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => onEditMode?.(data)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">✏️</button>
                    <button onClick={() => onDelete?.(data.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-colors">🗑️</button>
                </div>
            </div>

            <h5 className="font-black text-gray-800 text-xl leading-tight truncate mb-1">{data.itemName}</h5>

            <div className="flex items-center gap-1.5 mb-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border ${kindInfo.color}`}>
                    {kindInfo.icon} {kindInfo.label}
                </span>
                {data.category && <span className="text-[10px] font-bold text-gray-400">• {data.category}</span>}
            </div>

            <div className="flex items-center gap-2 border-t border-gray-50 pt-4 mt-2">
                <p className="text-base font-black text-blue-600 font-mono">
                    {data.price.toLocaleString()}{data.currency}
                </p>
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