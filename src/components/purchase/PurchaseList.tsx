import type { SpotPurchaseResponse } from "../../types/purchase";
import PurchaseCard from "./PurchaseCard";
import PurchaseListItem from "./PurchaseListItem";
import EmptyListState from '../common/EmptyListState';

interface Props {
    purchases: SpotPurchaseResponse[];
    filtered?: boolean;
    onReset?: () => void;
    onCreate?: () => void;
    onToggleStatus: (item: SpotPurchaseResponse) => void;
    onEdit: (item: SpotPurchaseResponse) => void;
    onDelete: (id: number) => void;
}

export default function PurchaseList({ purchases, onToggleStatus, onEdit, onDelete, filtered, onReset, onCreate }: Props) {
    if (!purchases || purchases.length === 0) {
        return <EmptyListState item="기념품" filtered={filtered} onReset={onReset} onCreate={onCreate} createLabel="기념품 추가하기" />;
    }

    return (
        <>
            {/* 📱 모바일 뷰: 카드형 목록 */}
            <div className="grid grid-cols-1 md:hidden gap-4">
                {purchases.map((p) => (
                    <PurchaseCard
                        key={p.id}
                        purchase={p}
                        onToggleStatus={onToggleStatus}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                ))}
            </div>

            {/* 🖥️ PC 데스크탑 뷰: 테이블형 목록 */}
            <div className="yume-card hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100 table-fixed">
                        <colgroup>
                            <col className="w-[12%]" />
                            <col className="w-[30%]" />
                            <col className="w-[15%]" />
                            <col className="w-[15%]" />
                            <col className="w-[12%]" />
                            <col className="w-[16%]" />
                        </colgroup>
                        <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">유형</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">아이템명</th>
                            <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500">상태</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">가격</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500">수량</th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500">관리</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100 font-sans">
                        {purchases.map((p) => (
                            <PurchaseListItem
                                key={p.id}
                                purchase={p}
                                onToggleStatus={onToggleStatus}
                                onEdit={onEdit}
                                onDelete={onDelete}
                            />
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
