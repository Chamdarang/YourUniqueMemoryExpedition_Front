import PurchaseForm, { type PurchaseFormValue } from './PurchaseForm';
import type { SpotPurchaseSaveRequest, SpotPurchaseResponse } from '../../types/purchase';
// ✅ 유틸리티 함수 임포트
import {
    formatPurchasePrice,
    getPurchaseKindInfo,
    getPurchaseStatusInfo
} from '../../utils/purchaseUtils';

interface SpotPurchaseCardProps {
    mode: 'add' | 'edit' | 'view';
    data?: SpotPurchaseResponse;
    form: SpotPurchaseSaveRequest;
    onChange: (updates: Partial<SpotPurchaseSaveRequest>) => void;
    onSave: (value: PurchaseFormValue) => Promise<void>;
    spotName?: string;
    onCancel: () => void;
    onDelete?: (id: number) => void;
    onEditMode?: (data: SpotPurchaseResponse) => void;
}

export default function PurchaseEditCard({
                                         mode, data, form, onChange, onSave, onCancel, onDelete, onEditMode, spotName
                                     }: SpotPurchaseCardProps) {

    // ➕ 등록 및 수정 모드
    if (mode === 'add' || mode === 'edit') {
        return <PurchaseForm editing={mode === 'edit'} value={form} onChange={onChange} onSave={onSave} onCancel={onCancel} spotName={spotName} />;
    }

    // 👀 조회 모드
    if (!data) return null;

    const kindInfo = getPurchaseKindInfo(data.kind);
    const statusInfo = getPurchaseStatusInfo(data.status);

    return (
        <div className="p-6 bg-white border border-gray-100 rounded-[2rem] transition-all relative group overflow-hidden hover:shadow-xl">
            <div className="flex justify-between items-start mb-4">
                <span className={`text-xs font-black px-3 py-1 rounded-full border tracking-widest ${statusInfo.color}`}>
                    {statusInfo.label}
                </span>
                <div className="flex gap-2">
                    <button type="button" aria-label={`${data.itemName} 수정`} onClick={() => onEditMode?.(data)} className="min-h-11 min-w-11 p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-colors">✏️</button>
                    <button type="button" aria-label={`${data.itemName} 삭제`} onClick={() => onDelete?.(data.id)} className="min-h-11 min-w-11 p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-colors">🗑️</button>
                </div>
            </div>

            <h5 className="font-black text-gray-800 text-xl leading-tight truncate mb-1">{data.itemName}</h5>

            <div className="flex items-center gap-1.5 mb-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md uppercase border ${kindInfo.color}`}>
                    {kindInfo.icon} {kindInfo.label}
                </span>
                {data.category && <span className="text-xs font-bold text-gray-400">• {data.category}</span>}
            </div>

            <div className="flex items-center gap-2 border-t border-gray-50 pt-4 mt-2">
                <p className="text-base font-black text-blue-600 font-mono">
                    {formatPurchasePrice(data.price, data.currency)}
                </p>
                <span className="text-gray-300">|</span>
                <p className="text-sm text-gray-400 font-bold">{data.quantity}개</p>
            </div>

            {data.note && (
                <div className="mt-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100/50">
                    <p className="text-sm text-gray-500 italic leading-relaxed break-keep">"{data.note}"</p>
                </div>
            )}
        </div>
    );
}
