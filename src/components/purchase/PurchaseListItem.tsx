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
    const title = purchase.itemName || purchase.spotName || '기념품';

    return (
        <tr className="group transition-colors hover:bg-gray-50/70">
            <td className="whitespace-nowrap px-6 py-3">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${kindInfo.color}`}>
                    {kindInfo.icon} {kindInfo.label}
                </span>
            </td>
            <td className="px-6 py-3">
                <div className="flex items-center gap-1">
                    <div className="max-w-[180px] truncate text-sm font-semibold text-gray-900">{purchase.itemName || purchase.spotName}</div>
                    <button type="button" aria-label={`${title} 수정`} onClick={() => onEdit(purchase)} className="yume-icon-button yume-icon-button-primary">✏️</button>
                </div>
                {purchase.note && <div className="mt-0.5 truncate text-xs text-gray-500 line-clamp-1">{purchase.note}</div>}
                {purchase.spotName && purchase.spotName !== purchase.itemName && <div className="mt-1 text-xs text-gray-500">{purchase.spotName}</div>}
                {purchase.kind === 'GOSHUINCHO' && purchase.status === 'ACQUIRED' && <Link to={`/goshuin-books?sourcePurchaseId=${purchase.id}`} className="inline-flex min-h-11 items-center text-xs text-blue-700">첩 만들기·열기</Link>}
            </td>
            <td className="px-6 py-3 text-center">
                <button
                    onClick={() => onToggleStatus(purchase)}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-all active:scale-95 md:min-h-10 ${statusInfo.color}`}
                >
                    {statusInfo.label}
                </button>
            </td>
            <td className="px-6 py-3 text-sm font-semibold text-gray-800">
                {formatPurchasePrice(purchase.price, purchase.currency)}
            </td>
            <td className="px-6 py-3 text-sm text-gray-500">{purchase.quantity}개</td>
            <td className="space-x-2 px-6 py-3 text-right">
                {purchase.spotUserId && purchase.spotUserId !== 0 ? (
                    <Link to={`/spots/${purchase.spotUserId}`} className="yume-icon-button yume-icon-button-primary" aria-label="장소 보기" title="장소 보기">📍</Link>
                ) : (
                    <span className="inline-flex h-10 w-10 items-center justify-center text-gray-300" aria-label="연결된 장소 없음">📍</span>
                )}
                <button type="button" aria-label={`${title} 삭제`} onClick={() => onDelete(purchase.id)} className="yume-icon-button yume-icon-button-danger" title="삭제">🗑️</button>
            </td>
        </tr>
    );
}
