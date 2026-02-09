import type { SpotPurchaseResponse } from "../../types/purchase";
import PurchaseCard from "./PurchaseCard";
import PurchaseListItem from "./PurchaseListItem";

interface Props {
    purchases: SpotPurchaseResponse[];
    onToggleStatus: (item: SpotPurchaseResponse) => void;
    onEdit: (item: SpotPurchaseResponse) => void;
    onDelete: (id: number) => void;
}

export default function PurchaseList({ purchases, onToggleStatus, onEdit, onDelete }: Props) {
    if (!purchases || purchases.length === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-100 shadow-sm">
                <p className="text-gray-400 text-lg font-bold italic tracking-tight">등록된 기념품이 없습니다.</p>
            </div>
        );
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
            <div className="hidden md:block bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
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
                            <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">유형</th>
                            <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">아이템명</th>
                            <th className="px-6 py-4 text-center text-[11px] font-black text-gray-400 uppercase tracking-widest">상태</th>
                            <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">가격</th>
                            <th className="px-6 py-4 text-left text-[11px] font-black text-gray-400 uppercase tracking-widest">수량</th>
                            <th className="px-6 py-4 text-right text-[11px] font-black text-gray-400 uppercase tracking-widest">관리</th>
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