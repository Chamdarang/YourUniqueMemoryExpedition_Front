import { Link } from 'react-router-dom';
import type { SpotPurchaseResponse } from "../../types/purchase";
import type { PurchaseKind } from "../../types/enums";

interface Props {
    purchases: SpotPurchaseResponse[];
    onToggleStatus: (item: SpotPurchaseResponse) => void;
    onEdit: (item: SpotPurchaseResponse) => void;
    onDelete: (id: number) => void;
}

const getKindInfo = (kind: PurchaseKind) => {
    switch (kind) {
        case 'GOSHUIN': return { icon: '🧧', label: '고슈인', color: 'text-red-600 bg-red-50 border-red-100' };
        case 'GOSHUINCHO': return { icon: '📒', label: '고슈인첩', color: 'text-orange-600 bg-orange-50 border-orange-100' };
        case 'SOUVENIR': return { icon: '🎁', label: '기념품', color: 'text-pink-600 bg-pink-50 border-pink-100' };
        case 'GACHA': return { icon: '🎰', label: '가챠', color: 'text-purple-600 bg-purple-50 border-purple-100' };
        case 'FOOD_ITEM': return { icon: '🍱', label: '식료품', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' };
        case 'STAMP': return { icon: '📔', label: '스탬프', color: 'text-blue-600 bg-blue-50 border-blue-100' };
        case 'TICKET': return { icon: '🎟️', label: '티켓', color: 'text-yellow-600 bg-yellow-50 border-yellow-100' };
        default: return { icon: '📦', label: '기타', color: 'text-gray-500 bg-gray-50 border-gray-100' };
    }
};

export default function PurchaseList({ purchases, onToggleStatus, onEdit, onDelete }: Props) {
    if (!purchases || purchases.length === 0) {
        return (
            <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
                <p className="text-gray-500 text-lg font-bold">등록된 기념품이 없습니다.</p>
            </div>
        );
    }

    return (
        <>
            <div className="block md:hidden space-y-4">
                {purchases.map((p) => {
                    const info = getKindInfo(p.kind);
                    return (
                        <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative">
                            <div className="flex justify-between items-start mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${info.color}`}>
                  {info.icon} {info.label}
                </span>
                                <button
                                    onClick={() => onToggleStatus(p)}
                                    className={`text-[10px] px-1.5 py-0.5 rounded border font-bold transition
                    ${p.status === 'ACQUIRED' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}
                  `}
                                >
                                    {p.status === 'ACQUIRED' ? '✅ 구매완료' : '🥺 사고싶음'}
                                </button>
                            </div>

                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-gray-900 text-lg truncate flex-1">{p.itemName}</h4>
                                    <button onClick={() => onEdit(p)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">✏️</button>
                                </div>
                                <p className="text-sm text-blue-600 font-black">
                                    {p.price.toLocaleString()}{p.currency} <span className="text-gray-300 font-normal ml-1">| {p.quantity}개</span>
                                </p>
                                {p.note && <p className="text-xs text-gray-400 mt-2 italic line-clamp-1">"{p.note}"</p>}
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-gray-100">
                                {/* ✅ p.spotUserId 사용 */}
                                {p.spotUserId && p.spotUserId !== 0 ? (
                                    <Link to={`/spots/${p.spotUserId}`} className="flex-1 py-2 text-center text-sm font-bold text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100">
                                        📍 장소확인
                                    </Link>
                                ) : (
                                    <div className="flex-1 py-2 text-center text-sm font-bold text-gray-300 bg-gray-50 rounded-lg cursor-not-allowed">📍 장소미지정</div>
                                )}
                                <button onClick={() => onDelete(p.id)} className="flex-1 py-2 text-sm font-bold text-red-500 bg-red-50 rounded-lg hover:bg-red-100">삭제</button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 table-fixed">
                        <colgroup><col className="w-[12%]" /><col className="w-[30%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[15%]" /></colgroup>
                        <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">유형</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">아이템명</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">상태</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">가격</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">수량</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">관리</th>
                        </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 font-sans">
                        {purchases.map((p) => {
                            const info = getKindInfo(p.kind);
                            return (
                                <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border ${info.color}`}>
                        {info.icon} {info.label}
                      </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-bold text-gray-900 truncate">{p.itemName}</div>
                                            <button onClick={() => onEdit(p)} className="opacity-0 group-hover:opacity-100 p-1 text-blue-500 hover:bg-blue-50 rounded transition-opacity">✏️</button>
                                        </div>
                                        {p.note && <div className="text-[10px] text-gray-400 truncate italic">{p.note}</div>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <button onClick={() => onToggleStatus(p)} className={`px-2 py-1 rounded-md font-black text-[10px] border transition-all active:scale-95 ${p.status === 'ACQUIRED' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-yellow-50 text-yellow-700 border-yellow-100'}`}>
                                            {p.status === 'ACQUIRED' ? '구매완료' : '사고싶음'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-mono font-bold text-blue-600">{p.price.toLocaleString()} {p.currency}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-gray-500">{p.quantity}개</td>
                                    <td className="px-6 py-4 text-right space-x-3">
                                        {/* ✅ p.spotUserId 사용 */}
                                        {p.spotUserId && p.spotUserId !== 0 ? (
                                            <Link to={`/spots/${p.spotUserId}`} className="text-gray-400 hover:text-blue-600 transition-colors font-bold" title="장소보기">📍</Link>
                                        ) : (
                                            <span className="text-gray-200 cursor-not-allowed">📍</span>
                                        )}
                                        <button onClick={() => onDelete(p.id)} className="text-gray-400 hover:text-red-600 transition-colors font-bold" title="삭제">🗑️</button>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}