import { Link } from 'react-router-dom';
import type { SpotPurchaseResponse } from "../../types/purchase";
import { formatPurchasePrice, getPurchaseKindInfo, getPurchaseStatusInfo } from "../../utils/purchaseUtils";

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
        <div className="yume-card yume-card-interactive relative p-5 group">
            <div className="flex justify-between items-start mb-3">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black border uppercase tracking-wider ${kindInfo.color}`}>
                  {kindInfo.icon} {kindInfo.label}
                </span>
                <button
                    onClick={() => onToggleStatus(purchase)}
                    className={`min-h-11 min-w-11 text-xs px-2 py-1 rounded-full border font-black transition-all active:scale-95 shadow-sm ${statusInfo.color}`}
                >
                    {statusInfo.label}
                </button>
            </div>

            <div className="mb-4">
                <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="font-black text-gray-900 text-lg truncate flex-1">{purchase.itemName}</h4>
                    <button type="button" aria-label={`${purchase.itemName} 수정`} onClick={() => onEdit(purchase)} className="yume-icon-button yume-icon-button-primary min-h-11 min-w-11">✏️</button>
                </div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-blue-600 font-mono tracking-tighter">
                        {formatPurchasePrice(purchase.price, purchase.currency)}
                    </span>
                    <span className="text-xs text-gray-300 font-bold">|</span>
                    <span className="text-xs text-gray-500 font-bold">{purchase.quantity}개</span>
                </div>
                {purchase.note && (
                    <p className="text-xs text-gray-500 mt-2.5 italic line-clamp-2 bg-gray-50/50 p-2 rounded-lg">
                        "{purchase.note}"
                    </p>
                )}
            </div>

            <div className="flex gap-2 pt-3 border-t border-gray-50">
                {purchase.spotUserId && purchase.spotUserId !== 0 ? (
                    <Link to={`/spots/${purchase.spotUserId}`} className="yume-button yume-button-secondary flex-1 text-center">
                        📍 장소확인
                    </Link>
                ) : (
                    <div className="inline-flex min-h-11 flex-1 items-center justify-center py-2.5 text-center text-xs font-black text-gray-300 bg-gray-50/50 rounded-xl cursor-not-allowed">
                        📍 장소미지정
                    </div>
                )}
                <button type="button" aria-label={`${purchase.itemName} 삭제`} onClick={() => onDelete(purchase.id)} className="yume-button yume-button-danger-outline flex-1">
                    삭제
                </button>
            </div>
        </div>
    );
}
