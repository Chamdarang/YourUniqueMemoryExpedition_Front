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
    const title = purchase.itemName || purchase.spotName || '기념품';

    return (
        <div className="yume-card yume-card-interactive relative p-3 group">
            <div className="flex justify-between items-start gap-2 mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${kindInfo.color}`}>
                  {kindInfo.icon} {kindInfo.label}
                </span>
                <button
                    onClick={() => onToggleStatus(purchase)}
                    className={`inline-flex min-h-11 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-all active:scale-95 md:min-h-10 ${statusInfo.color}`}
                >
                    {statusInfo.label}
                </button>
            </div>

            <div className="mb-3">
                <div className="flex items-center gap-1 mb-1">
                    <h4 className="font-bold text-gray-900 text-base truncate flex-1">{purchase.itemName || purchase.spotName}</h4>
                    <button type="button" aria-label={`${title} 수정`} onClick={() => onEdit(purchase)} className="yume-icon-button yume-icon-button-primary">✏️</button>
                </div>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-gray-800">
                        {formatPurchasePrice(purchase.price, purchase.currency)}
                    </span>
                    <span aria-hidden="true" className="text-gray-300">·</span>
                    <span className="text-xs text-gray-500">{purchase.quantity}개</span>
                </div>
                {purchase.note && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                        {purchase.note}
                    </p>
                )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {purchase.kind === 'GOSHUINCHO' && purchase.status === 'ACQUIRED' && <Link to={`/goshuin-books?sourcePurchaseId=${purchase.id}`} className="yume-button yume-button-secondary w-full">첩 만들기·열기</Link>}
                {purchase.spotUserId && purchase.spotUserId !== 0 ? (
                    <Link to={`/spots/${purchase.spotUserId}`} className="yume-button yume-button-secondary flex-1 text-center">
                        📍 장소확인
                    </Link>
                ) : (
                    <div className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-400 cursor-not-allowed">
                        {purchase.spotName || '장소미지정'}
                    </div>
                )}
                <button type="button" aria-label={`${title} 삭제`} onClick={() => onDelete(purchase.id)} className="yume-button yume-button-danger-outline flex-1">
                    삭제
                </button>
            </div>
        </div>
    );
}
