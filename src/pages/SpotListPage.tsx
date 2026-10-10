import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { deleteSpot, getMySpots, updateSpot } from "../api/spotApi";
import { deletePurchase, updatePurchase, getAllPurchases, createPurchase } from "../api/purchaseApi";

// Types
import type { SpotResponse } from "../types/spot";
import type { SpotPurchaseResponse, SpotPurchaseSaveRequest, PurchaseSearchParams } from "../types/purchase";
import type { SpotInUseError, UsedScheduleResponse } from "../types/error";

// Components
import SpotFilter, { type SpotSearchParams } from "../components/spot/SpotFilter";
import SpotList from "../components/spot/SpotList";
import PurchaseFilter from "../components/purchase/PurchaseFilter.tsx"; // ✅ 분리된 컴포넌트
import PurchaseList from "../components/purchase/PurchaseList";
import SpotGroupList from "../components/spot/SpotGroupList";
import Pagination from "../components/common/Pagination";
import SpotInUseModal from "../components/spot/SpotInUseModal.tsx";
import { useFeedback } from "../components/common/useFeedback";
import LoadErrorState from '../components/common/LoadErrorState';

// ❌ PURCHASE_KIND_KEYS 등 기념품 유틸 임포트는 PurchaseFilter 내부로 이동했으므로 여기서 삭제했습니다.

type AdminMode = 'SPOT' | 'GROUP' | 'PURCHASE';

export default function SpotListPage() {
    const { confirm, showToast } = useFeedback();
    const [searchParams, setSearchParams] = useSearchParams();
    const modeFromUrl = searchParams.get('mode');
    const viewMode: AdminMode = modeFromUrl === 'GROUP' || modeFromUrl === 'PURCHASE' ? modeFromUrl : 'SPOT';
    const [loading, setLoading] = useState(true); // ✅ 로딩 상태
    const requestVersion = useRef(0);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [spots, setSpots] = useState<SpotResponse[]>([]);
    const [purchases, setPurchases] = useState<SpotPurchaseResponse[]>([]);

    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    const [activePFilter, setActivePFilter] = useState<PurchaseSearchParams>({});
    const [spotFilterVersion, setSpotFilterVersion] = useState(0);
    const [purchaseFilterVersion, setPurchaseFilterVersion] = useState(0);
    const [spotFilter, setSpotFilter] = useState<SpotSearchParams>({
        keyword: '',
        type: 'ALL',
        isVisit: 'ALL'
    });

    const [isInUseModalOpen, setIsInUseModalOpen] = useState(false);
    const [conflictUsage, setConflictUsage] = useState<UsedScheduleResponse[]>([]);
    const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formPurchase, setFormPurchase] = useState<SpotPurchaseSaveRequest & { spotUserId: number }>({
        itemName: '', kind: 'SOUVENIR', category: '', price: 0, currency: 'JPY',
        status: 'WANT', quantity: 1, acquiredDate: new Date().toISOString().split('T')[0],
        note: '', spotUserId: 0
    });

    const fetchPurchasesData = useCallback(async (pageNum = 0) => {
        const version = ++requestVersion.current;
        try {
            setLoading(true); // ✅ 로딩 시작
            const data = await getAllPurchases({ page: pageNum, size: 20, ...activePFilter });
            if (version !== requestVersion.current) return;
            setPurchases(data.content);
            setTotalPages(data.totalPages);
            setTotalElements(data.totalElements);
            setPage(data.number);
            setLoadError(null);
        } catch {
            if (version !== requestVersion.current) return;
            setLoadError('기념품 목록을 불러오지 못했습니다.');
        } finally { if (version === requestVersion.current) setLoading(false); } // ✅ 로딩 종료
    }, [activePFilter]);

    const fetchSpotsData = useCallback(async (pageNum = 0, currentFilter = spotFilter) => {
        const version = ++requestVersion.current;
        try {
            setLoading(true); // ✅ 로딩 시작
            const data = await getMySpots({
                page: pageNum,
                size: 20,
                keyword: currentFilter.keyword,
                spotType: currentFilter.type === 'ALL' ? undefined : currentFilter.type,
                isVisit: currentFilter.isVisit === 'ALL' ? undefined : currentFilter.isVisit
            });
            if (version !== requestVersion.current) return;
            setSpots(data.content);
            setLoadError(null);
            if (viewMode === 'SPOT') {
                setTotalPages(data.totalPages);
                setTotalElements(data.totalElements);
                setPage(data.number);
            }
        } catch {
            if (version !== requestVersion.current) return;
            setLoadError('장소 목록을 불러오지 못했습니다.');
        } finally { if (version === requestVersion.current) setLoading(false); } // ✅ 로딩 종료
    }, [spotFilter, viewMode]);

    useEffect(() => {
        if (viewMode === 'PURCHASE') {
            fetchPurchasesData(0);
        }
        else if (viewMode === 'SPOT') {
            fetchSpotsData(0, spotFilter);
        } else {
            setLoading(false);
        }
        const versionRef = requestVersion;
        return () => { versionRef.current++; };
    }, [viewMode, activePFilter, spotFilter, fetchPurchasesData, fetchSpotsData]);

    const handleSpotSearch = (newParams: SpotSearchParams) => {
        setSpotFilter(newParams);
        setPage(0);
    };

    const handleDeleteSpot = async (id: number, force = false) => {
        if (!force && !await confirm({ title: '장소 삭제', message: '이 장소를 삭제할까요?', confirmLabel: '삭제', danger: true })) return;
        try {
            await deleteSpot(id);
            showToast({ message: "장소를 삭제했습니다.", type: 'success' });
            setIsInUseModalOpen(false);
            fetchSpotsData(page);
        } catch (error) {
            const err = error as Partial<SpotInUseError> & Error;
            const errorCode = err.code;
            const errorData = err.data;
            if (errorCode === 'SPOT_IN_USE') {
                setPendingDeleteId(id);
                setConflictUsage(errorData || []);
                setIsInUseModalOpen(true);
            } else {
                showToast({ message: err.message || "장소를 삭제하지 못했습니다.", type: 'error' });
            }
        }
    };

    const handleToggleVisit = async (spot: SpotResponse) => {
        try {
            await updateSpot(spot.id, {
                spotType: spot.spotType,
                isVisit: !spot.isVisit
            });
            fetchSpotsData(page);
        } catch { showToast({ message: "방문 상태를 바꾸지 못했습니다.", type: 'error' }); }
    };

    const handleSavePurchase = async (data: SpotPurchaseSaveRequest & { spotUserId: number }) => {
        try {
            const { spotUserId, ...requestBody } = data;
            if (editingId) {
                await updatePurchase(editingId, { ...requestBody, spotUserId });
                showToast({ message: "기념품 정보를 수정했습니다. ✨", type: 'success' });
            } else {
                await createPurchase(spotUserId, requestBody);
                showToast({ message: "기념품을 추가했습니다. 🎁", type: 'success' });
            }
            setIsAdding(false);
            setEditingId(null);
            setFormPurchase({
                itemName: '', kind: 'SOUVENIR', category: '', price: 0, currency: 'JPY',
                status: 'WANT', quantity: 1, acquiredDate: new Date().toISOString().split('T')[0],
                note: '', spotUserId: 0
            });
            fetchPurchasesData(0);
        } catch (error) {
            console.error(error);
            throw error;
        }
    };

    const handleEditStart = (item: SpotPurchaseResponse) => {
        setEditingId(item.id);
        setFormPurchase({
            itemName: item.itemName, kind: item.kind, category: item.category,
            price: item.price, currency: item.currency, status: item.status,
            quantity: item.quantity, acquiredDate: item.acquiredDate,
            note: item.note, spotUserId: item.spotUserId
        });
        setIsAdding(true);
    };

    const handleModeChange = (newMode: AdminMode) => {
        setLoadError(null);
        setSearchParams(current => {
            const next = new URLSearchParams(current);
            next.set('mode', newMode);
            return next;
        });
    };

    const handleTogglePurchaseStatus = async (purchase: SpotPurchaseResponse) => {
        try {
            const nextStatus = purchase.status === 'ACQUIRED' ? 'WANT' : 'ACQUIRED';
            await updatePurchase(purchase.id, { ...purchase, status: nextStatus });
            await fetchPurchasesData(page);
            showToast({ message: '기념품 상태를 변경했습니다.', type: 'success' });
        } catch {
            showToast({ message: '기념품 상태를 변경하지 못했습니다.', type: 'error' });
        }
    };

    const handleDeletePurchase = async (purchaseId: number) => {
        const target = purchases.find(purchase => purchase.id === purchaseId);
        if (!await confirm({ title: '기념품 삭제', message: `'${target?.itemName || '기념품'}'을 삭제할까요?`, confirmLabel: '삭제', danger: true })) return;
        try {
            await deletePurchase(purchaseId);
            await fetchPurchasesData(page);
            showToast({ message: '기념품을 삭제했습니다.', type: 'success' });
        } catch {
            showToast({ message: '기념품을 삭제하지 못했습니다.', type: 'error' });
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 md:p-6 pb-20 font-sans relative">

            {/* ✅ 전역 로딩 오버레이 추가 */}
            {loading && viewMode !== 'GROUP' && (
                <div role="status" aria-label="목록 불러오는 중" className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                    <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-gray-900">{viewMode === 'PURCHASE' ? '기념품 장부' : '내 장소'}</h1>
                    <p className="text-gray-500 text-xs mt-1 font-bold">{viewMode === 'GROUP' ? '그룹으로 장소를 모아 관리하세요.' : loadError ? '목록을 다시 불러와 주세요.' : `총 ${totalElements}개의 항목 관리 중`}</p>
                </div>
                <div data-guide-target="spots-tabs" className="yume-segmented w-full md:w-auto">
                    <button aria-pressed={viewMode === 'SPOT'} data-guide-target="spots-tab-spot" data-guide-state={viewMode === 'SPOT' ? 'selected' : 'unselected'} onClick={() => handleModeChange('SPOT')} className="yume-segment">📍 장소</button>
                    <button aria-pressed={viewMode === 'GROUP'} data-guide-target="spots-tab-group" data-guide-state={viewMode === 'GROUP' ? 'selected' : 'unselected'} onClick={() => handleModeChange('GROUP')} className="yume-segment">📂 그룹</button>
                    <button aria-pressed={viewMode === 'PURCHASE'} data-guide-target="spots-tab-purchase" data-guide-state={viewMode === 'PURCHASE' ? 'selected' : 'unselected'} onClick={() => handleModeChange('PURCHASE')} className="yume-segment">🎁 기념품</button>
                </div>
            </div>

            <div data-guide-target="spots-content">
            {viewMode === 'SPOT' && (
                <div className="animate-in fade-in duration-300">
                    <SpotFilter key={spotFilterVersion} onSearch={handleSpotSearch} />
                    {loadError && <LoadErrorState message={loadError} retrying={loading} onRetry={() => void fetchSpotsData(page, spotFilter)} />}
                    {(!loadError || spots.length > 0) && <SpotList spots={spots} onDelete={handleDeleteSpot} onToggleVisit={handleToggleVisit}
                        filtered={Boolean(spotFilter.keyword.trim() || spotFilter.type !== 'ALL' || spotFilter.isVisit !== 'ALL')}
                        onReset={() => { setSpotFilter({ keyword: '', type: 'ALL', isVisit: 'ALL' }); setSpotFilterVersion(version => version + 1); }} />}
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => fetchSpotsData(p, spotFilter)} />
                </div>
            )}

            {viewMode === 'GROUP' && <SpotGroupList />}

            {viewMode === 'PURCHASE' && (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <PurchaseFilter
                        key={purchaseFilterVersion}
                        selectedSpotName={purchases.find(purchase => purchase.id === editingId)?.spotName ?? undefined}
                        onSearch={setActivePFilter}
                        onSave={handleSavePurchase}
                        isAdding={isAdding}
                        setIsAdding={setIsAdding}
                        editingId={editingId}
                        setEditingId={setEditingId}
                        formPurchase={formPurchase}
                        setFormPurchase={setFormPurchase}
                    />

                    {loadError && <LoadErrorState message={loadError} retrying={loading} onRetry={() => void fetchPurchasesData(page)} />}
                    {(!loadError || purchases.length > 0) && <PurchaseList
                        purchases={purchases}
                        filtered={Boolean(activePFilter.keyword?.trim() || activePFilter.category?.trim() || activePFilter.kind || activePFilter.status)}
                        onReset={() => { setActivePFilter({}); setPurchaseFilterVersion(version => version + 1); }}
                        onCreate={() => { setEditingId(null); setIsAdding(true); }}
                        onEdit={handleEditStart}
                        onToggleStatus={(purchase) => void handleTogglePurchaseStatus(purchase)}
                        onDelete={(purchaseId) => void handleDeletePurchase(purchaseId)}
                    />}

                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={fetchPurchasesData} />
                </div>
            )}
            </div>

            <SpotInUseModal
                isOpen={isInUseModalOpen}
                onClose={() => setIsInUseModalOpen(false)}
                usageList={conflictUsage}
                onSpotDeleteRetry={() => pendingDeleteId && handleDeleteSpot(pendingDeleteId, true)}
            />

        </div>
    );
}
