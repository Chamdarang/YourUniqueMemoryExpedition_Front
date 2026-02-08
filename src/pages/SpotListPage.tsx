import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { deleteSpot, getMySpots } from "../api/spotApi";
import { deletePurchase, updatePurchase, getAllPurchases, createPurchase } from "../api/purchaseApi";

// Types
import type { SpotResponse } from "../types/spot";
import type { SpotPurchaseResponse, SpotPurchaseSaveRequest, PurchaseSearchParams } from "../types/purchase";
import type { PurchaseStatus, PurchaseKind } from "../types/enums";

// Components
import SpotFilter, { type SpotSearchParams } from "../components/spot/SpotFilter";
import SpotList from "../components/spot/SpotList";
import PurchaseList from "../components/purchase/PurchaseList";
import SpotGroupList from "../components/spot/SpotGroupList";
import Pagination from "../components/common/Pagination";

type AdminMode = 'SPOT' | 'GROUP' | 'PURCHASE';

export default function SpotListPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const modeFromUrl = (searchParams.get('mode') as AdminMode) || 'SPOT';

    const [viewMode, setViewMode] = useState<AdminMode>(modeFromUrl);
    const [loading, setLoading] = useState(true);
    const [spots, setSpots] = useState<SpotResponse[]>([]);
    const [purchases, setPurchases] = useState<SpotPurchaseResponse[]>([]);

    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    const [pFilterDraft, setPFilterDraft] = useState<PurchaseSearchParams>({ keyword: '', category: '' });
    const [activePFilter, setActivePFilter] = useState<PurchaseSearchParams>({});
    const [spotFilter, setSpotFilter] = useState<SpotSearchParams>({ keyword: '', type: 'ALL', isVisit: 'ALL' });

    // ➕ 추가/수정 관련 상태
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formPurchase, setFormPurchase] = useState<SpotPurchaseSaveRequest & { spotUserId?: number }>({
        itemName: '', kind: 'SOUVENIR', category: '', price: 0, currency: 'JPY',
        status: 'WANT', quantity: 1, acquiredDate: new Date().toISOString().split('T')[0],
        note: '', spotUserId: 0 // ✅ purchase.ts 최신 항목명 적용
    });

    const fetchPurchasesData = async (pageNum = 0) => {
        try {
            setLoading(true);
            const data = await getAllPurchases({ page: pageNum, size: 20, ...activePFilter });
            setPurchases(data.content);
            setTotalPages(data.totalPages);
            setTotalElements(data.totalElements);
            setPage(data.number);
        } finally { setLoading(false); }
    };

    const fetchSpotsData = async (pageNum = 0, currentFilter = spotFilter) => {
        try {
            setLoading(true);
            const data = await getMySpots({ page: pageNum, size: 100, ...currentFilter });
            setSpots(data.content);
            if (viewMode === 'SPOT') {
                setTotalPages(data.totalPages);
                setTotalElements(data.totalElements);
                setPage(data.number);
            }
        } finally { setLoading(false); }
    };

    useEffect(() => {
        if (viewMode === 'PURCHASE') { fetchPurchasesData(0); fetchSpotsData(0); }
        else if (viewMode === 'SPOT') { fetchSpotsData(0, spotFilter); }
    }, [viewMode, activePFilter]);

    const handleSavePurchase = async () => {
        if (!formPurchase.itemName) return alert("아이템 이름을 입력해 주세요.");
        try {
            const { spotUserId, ...requestBody } = formPurchase; // ✅ 명칭 동기화
            if (editingId) {
                await updatePurchase(editingId, requestBody);
                alert("수정되었습니다! ✨");
            } else {
                await createPurchase(spotUserId || 0, requestBody); // ✅ 명칭 동기화
                alert("추가되었습니다! 🎁");
            }
            setIsAdding(false); setEditingId(null);
            setFormPurchase({ ...formPurchase, itemName: '', note: '', spotUserId: 0, status: 'WANT' });
            fetchPurchasesData(editingId ? page : 0);
        } catch { alert("처리에 실패했습니다."); }
    };

    const handleEditStart = (item: SpotPurchaseResponse) => {
        setEditingId(item.id);
        setFormPurchase({
            itemName: item.itemName, kind: item.kind, category: item.category,
            price: item.price, currency: item.currency, status: item.status,
            quantity: item.quantity, acquiredDate: item.acquiredDate,
            note: item.note, spotUserId: item.spotUserId // ✅ 명칭 동기화
        });
        setIsAdding(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleModeChange = (newMode: AdminMode) => { setViewMode(newMode); setSearchParams({ mode: newMode }); };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 pb-20 font-sans">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900">{viewMode === 'PURCHASE' ? '기념품 장부' : '내 장소'}</h1>
                    <p className="text-gray-400 text-xs mt-1 font-bold">총 {totalElements}개의 항목 관리 중</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-2xl shadow-inner">
                    <button onClick={() => handleModeChange('SPOT')} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${viewMode === 'SPOT' ? 'bg-white text-blue-600 shadow-sm scale-105' : 'text-gray-500'}`}>📍 스팟</button>
                    <button onClick={() => handleModeChange('GROUP')} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${viewMode === 'GROUP' ? 'bg-white text-orange-600 shadow-sm scale-105' : 'text-gray-500'}`}>📂 그룹</button>
                    <button onClick={() => handleModeChange('PURCHASE')} className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${viewMode === 'PURCHASE' ? 'bg-white text-pink-600 shadow-sm scale-105' : 'text-gray-500'}`}>🎁 기념품</button>
                </div>
            </div>

            {viewMode === 'SPOT' && (
                <div className="animate-in fade-in duration-300">
                    <SpotFilter onSearch={(f) => { setSpotFilter(f); fetchSpotsData(0, f); }} />
                    <SpotList spots={spots} onDelete={(id) => deleteSpot(id).then(() => fetchSpotsData(page))} onToggleVisit={() => {}} />
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => fetchSpotsData(p, spotFilter)} />
                </div>
            )}

            {viewMode === 'GROUP' && <SpotGroupList />}

            {viewMode === 'PURCHASE' && (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setIsAdding(!isAdding); if(isAdding) setEditingId(null); }} className={`px-6 py-2 rounded-xl font-black text-sm shadow-md ${isAdding ? 'bg-gray-200 text-gray-600' : 'bg-pink-600 text-white'}`}>
                            {isAdding ? '닫기' : '+ 새 기념품 추가'}
                        </button>
                    </div>

                    {isAdding && (
                        <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-200 space-y-4 shadow-inner">
                            <h3 className="font-black text-gray-800 flex items-center gap-2">
                                {editingId ? '✏️ 기념품 정보 수정' : '🎁 새 기념품 등록'}
                                {editingId && <span className="text-[10px] text-blue-500 font-bold bg-blue-50 px-2 py-0.5 rounded-full">편집 모드</span>}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <input className="p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none focus:ring-2 focus:ring-pink-400" placeholder="아이템 이름 (필수)" value={formPurchase.itemName} onChange={e => setFormPurchase({...formPurchase, itemName: e.target.value})} />
                                <select className="p-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none" value={formPurchase.spotUserId} onChange={e => setFormPurchase({...formPurchase, spotUserId: Number(e.target.value)})}>
                                    <option value="0">📍 장소 미지정 (가챠/기타)</option>
                                    {spots.map(s => <option key={s.id} value={s.id}>{s.spotName}</option>)}
                                </select>
                                <select className="p-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none" value={formPurchase.kind} onChange={e => setFormPurchase({...formPurchase, kind: e.target.value as PurchaseKind})}>
                                    <option value="SOUVENIR">🎁 기념품</option>
                                    <option value="GACHA">🎰 가챠</option>
                                    <option value="GOSHUIN">🧧 고슈인</option>
                                    <option value="GOSHUINCHO">📒 고슈인첩</option>
                                    <option value="FOOD_ITEM">🍱 식료품</option>
                                    <option value="STAMP">📔 스탬프</option>
                                    <option value="TICKET">🎟️ 티켓</option>
                                    <option value="OTHER">📦 기타</option>
                                </select>
                                <select className="p-3 bg-white rounded-xl text-sm font-bold border border-gray-200 outline-none" value={formPurchase.status} onChange={e => setFormPurchase({...formPurchase, status: e.target.value as PurchaseStatus})}>
                                    <option value="WANT">🥺 사고 싶음</option>
                                    <option value="AVAILABLE">🏷️ 판매 중</option>
                                    <option value="ACQUIRED">🎁 구매 완료</option>
                                    <option value="SKIPPED">❌ 패스함</option>
                                    <option value="UNAVAILABLE">🚫 품절/없음</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <input className="p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none" placeholder="카테고리" value={formPurchase.category} onChange={e => setFormPurchase({...formPurchase, category: e.target.value})} />
                                <div className="flex gap-2">
                                    <input type="number" className="flex-1 p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none" placeholder="가격" value={formPurchase.price || ''} onChange={e => setFormPurchase({...formPurchase, price: Number(e.target.value)})} />
                                    <select className="p-3 bg-white rounded-xl text-xs font-bold border border-gray-200 outline-none" value={formPurchase.currency} onChange={e => setFormPurchase({...formPurchase, currency: e.target.value})}>
                                        <option value="JPY">JPY</option><option value="KRW">KRW</option>
                                    </select>
                                </div>
                                <input className="p-3 bg-white rounded-xl text-sm border border-gray-200 outline-none" placeholder="메모" value={formPurchase.note} onChange={e => setFormPurchase({...formPurchase, note: e.target.value})} />
                                <button onClick={handleSavePurchase} className="bg-pink-600 text-white rounded-xl font-black text-sm hover:bg-pink-700 shadow-lg active:scale-95 transition-transform">{editingId ? '수정 완료' : '저장하기'}</button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-1">
                            <input className="p-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-pink-500 border-none" placeholder="아이템/메모 검색" value={pFilterDraft.keyword} onChange={e => setPFilterDraft({...pFilterDraft, keyword: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && setActivePFilter(pFilterDraft)} />
                            <select className="p-2.5 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 border-none outline-none" value={pFilterDraft.kind || ""} onChange={e => setPFilterDraft({...pFilterDraft, kind: (e.target.value as PurchaseKind) || undefined})}>
                                <option value="">전체 종류</option>
                                <option value="SOUVENIR">기념품</option><option value="GACHA">가챠</option><option value="GOSHUIN">고슈인</option><option value="FOOD_ITEM">식료품</option>
                            </select>
                            <select className="p-2.5 bg-gray-50 rounded-xl text-sm font-bold text-gray-600 border-none outline-none" value={pFilterDraft.status || ""} onChange={e => setPFilterDraft({...pFilterDraft, status: (e.target.value as PurchaseStatus) || undefined})}>
                                <option value="">전체 상태</option>
                                <option value="WANT">사고 싶음</option><option value="ACQUIRED">구매 완료</option>
                            </select>
                            <input className="p-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-pink-500 border-none" placeholder="카테고리 검색" value={pFilterDraft.category} onChange={e => setPFilterDraft({...pFilterDraft, category: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && setActivePFilter(pFilterDraft)} />
                        </div>
                        <button onClick={() => setActivePFilter(pFilterDraft)} className="px-8 py-2.5 bg-gray-900 text-white rounded-xl font-black text-sm hover:bg-gray-800 transition-all shadow-md">검색</button>
                    </div>

                    {loading ? <div className="p-20 text-center text-gray-400 font-bold">로딩 중...</div> : (
                        <>
                            {/* ✅ onEdit 프롭스 전달 누락 해결 */}
                            <PurchaseList
                                purchases={purchases}
                                onEdit={handleEditStart}
                                onToggleStatus={(p) => updatePurchase(p.id, { ...p, status: p.status === 'ACQUIRED' ? 'WANT' : 'ACQUIRED' } as any).then(() => fetchPurchasesData(page))}
                                onDelete={(id) => deletePurchase(id).then(() => fetchPurchasesData(page))}
                            />
                            <Pagination currentPage={page} totalPages={totalPages} onPageChange={fetchPurchasesData} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}