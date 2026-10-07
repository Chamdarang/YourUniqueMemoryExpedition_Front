import { Link } from 'react-router-dom';
import type { SpotPurchaseResponse } from "../../types/purchase";
import { formatPurchasePrice, getPurchaseKindInfo, getPurchaseStatusInfo } from "../../utils/purchaseUtils";

interface Props {
    purchase: SpotPurchaseResponse;
    onToggleStatus: (item: SpotPurchaseResponse) => void;
    onEdit: (item: SpotPurchaseResponse) => void;
    onDelete: (id: number) => void;
}

export default function PurchaseListItem({ purchase, onToggleStatus, onEdit, onDelete }: Props) {
    const kindInfo = getPurchaseKindInfo(purchase.kind);
    const statusInfo = getPurchaseStatusInfo(purchase.status);

    return (
        <tr className="hover:bg-gray-50/50 transition-colors group">
            <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-black border uppercase tracking-tight ${kindInfo.color}`}>
                    {kindInfo.icon} {kindInfo.label}
                </span>
            </td>
            <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="text-sm font-black text-gray-900 truncate max-w-[180px]">{purchase.itemName}</div>
                    <button type="button" aria-label={`${purchase.itemName} 수정`} onClick={() => onEdit(purchase)} className="min-h-11 min-w-11 p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-all shadow-sm">✏️</button>
                </div>
                {purchase.note && <div className="text-xs text-gray-500 truncate italic mt-0.5 line-clamp-1">"{purchase.note}"</div>}
            </td>
            <td className="px-6 py-4 text-center">
                <button
                    onClick={() => onToggleStatus(purchase)}
                    className={`min-h-11 min-w-11 px-2.5 py-1 rounded-full font-black text-xs border transition-all active:scale-95 shadow-sm ${statusInfo.color}`}
                >
                    {statusInfo.label}
                </button>
            </td>
            <td className="px-6 py-4 text-sm font-mono font-black text-blue-600 tracking-tighter">
                {formatPurchasePrice(purchase.price, purchase.currency)}
            </td>
            <td className="px-6 py-4 text-sm font-bold text-gray-500">{purchase.quantity}개</td>
            <td className="px-6 py-4 text-right space-x-3">
                {purchase.spotUserId && purchase.spotUserId !== 0 ? (
                    <Link to={`/spots/${purchase.spotUserId}`} className="text-gray-500 hover:text-blue-600 transition-colors font-bold text-lg" title="장소보기">📍</Link>
                ) : (
                    <span className="text-gray-200 cursor-not-allowed text-lg">📍</span>
                )}
                <button type="button" aria-label={`${purchase.itemName} 삭제`} onClick={() => onDelete(purchase.id)} className="min-h-11 min-w-11 text-gray-500 hover:text-red-500 transition-colors font-bold text-lg" title="삭제">🗑️</button>
            </td>
        </tr>
    );
}
