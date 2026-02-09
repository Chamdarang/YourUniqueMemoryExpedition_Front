import { Link } from 'react-router-dom';
import type { SpotPurchaseResponse } from "../../types/purchase";
import { getPurchaseKindInfo, getPurchaseStatusInfo } from "../../utils/purchaseUtils";

interface Props {
    purchase: SpotPurchaseResponse;
    onToggleStatus: (item: SpotPurchaseResponse) => void;
    onEdit: (item: SpotPurchaseResponse) => void;
    onDelete: (id: number) => void;
}

export default function PurchaseCard({ purchase, onToggleStatus, onEdit, onDelete }: Props) {
    const kindInfo = getPurchaseKindInfo(purchase.kind);
    const statusInfo = getPurchaseStatusInfo(purchase.status);

    return (
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm relative group hover:border-gray-200 transition-all">
            <div className="flex justify-between items-start mb-3">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider ${kindInfo.color}`}>
                  {kindInfo.icon} {kindInfo.label}
                </span>
                <button
                    onClick={() => onToggleStatus(purchase)}
                    className={`text-[10px] px-2 py-1 rounded-full border font-black transition-all active:scale-95 shadow-sm ${statusInfo.color}`}
                >
                    {statusInfo.label}
                </button>
            </div>

            <div className="mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="font-black text-gray-900 text-lg truncate flex-1">{purchase.itemName}</h4>
                    <button onClick={() => onEdit(purchase)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-all">✏️</button>
                </div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-blue-600 font-mono tracking-tighter">
                        {purchase.price.toLocaleString()}{purchase.currency}
                    </span>
                    <span className="text-xs text-gray-300 font-bold">|</span>
                    <span className="text-xs text-gray-400 font-bold">{purchase.quantity}개</span>
                </div>
                {purchase.note && (
                    <p className="text-[11px] text-gray-400 mt-2.5 italic line-clamp-2 bg-gray-50/50 p-2 rounded-lg">
                        "{purchase.note}"
                    </p>
                )}
            </div>

            <div className="flex gap-2 pt-3 border-t border-gray-50">
                {purchase.spotUserId && purchase.spotUserId !== 0 ? (
                    <Link to={`/spots/${purchase.spotUserId}`} className="flex-1 py-2.5 text-center text-[11px] font-black text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                        📍 장소확인
                    </Link>
                ) : (
                    <div className="flex-1 py-2.5 text-center text-[11px] font-black text-gray-300 bg-gray-50/50 rounded-xl cursor-not-allowed">
                        📍 장소미지정
                    </div>
                )}
                <button onClick={() => onDelete(purchase.id)} className="flex-1 py-2.5 text-[11px] font-black text-red-400 bg-red-50/50 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors">
                    삭제
                </button>
            </div>
        </div>
    );
}