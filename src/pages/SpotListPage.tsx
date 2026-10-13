import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

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
import SpotGroupManager from "../components/spot/SpotGroupManager";
import RecordsPageLayout from '../components/common/RecordsPageLayout';
import { getAllGroups } from '../api/groupApi';
import type { SpotGroupResponse } from '../types/groups';
import Pagination from "../components/common/Pagination";
import SpotInUseModal from "../components/spot/SpotInUseModal.tsx";
import { useFeedback } from "../components/common/useFeedback";
import LoadErrorState from '../components/common/LoadErrorState';

// ❌ PURCHASE_KIND_KEYS 등 기념품 유틸 임포트는 PurchaseFilter 내부로 이동했으므로 여기서 삭제했습니다.

type AdminMode = 'SPOT' | 'PURCHASE';

export default function SpotListPage() {
    const { confirm, showToast } = useFeedback();
    const location = useLocation();
    const returnKey = 'yume:goshuin-ledger-return:' + (localStorage.getItem('username') || '');
    const [returnState] = useState<{ filter: PurchaseSearchParams; page: number; scroll: number } | null>(() => {
        if (!location.state?.restoreGoshuinLedger) return null;
        try { return JSON.parse(sessionStorage.getItem(returnKey) || 'null'); } catch { return null; }
    });
    const restorePending = useRef(Boolean(returnState));
    const rememberLedger = () => { if (viewMode === 'PURCHASE') sessionStorage.setItem(returnKey, JSON.stringify({ filter: activePFilter, page, scroll: document.querySelector('main')?.scrollTop || 0 })); };
    const [searchParams, setSearchParams] = useSearchParams();
    const modeFromUrl = searchParams.get('mode');
    const viewMode: AdminMode = modeFromUrl === 'PURCHASE' ? 'PURCHASE' : 'SPOT';
    const groupIdFromUrl = Number(searchParams.get('groupId'));
    const initialGroupId = Number.isInteger(groupIdFromUrl) && groupIdFromUrl > 0
        ? groupIdFromUrl
        : undefined;
    const ungrouped = searchParams.get('ungrouped') === 'true';
    const [groups, setGroups] = useState<SpotGroupResponse[]>([]);
    const [groupError, setGroupError] = useState('');
    const [groupRevision, setGroupRevision] = useState(0);
    const [managingGroups, setManagingGroups] = useState(false);
    const recordsKey = 'yume:records:' + (localStorage.getItem('username') || '');
    const [savedState] = useState(() => { try { return JSON.parse(sessionStorage.getItem(recordsKey) || '{}'); } catch { return {}; } });
    const rememberedPages = useRef({ SPOT: savedState.spotPage || 0, PURCHASE: returnState?.page || savedState.purchasePage || 0 });
    const rememberedScroll = useRef({ SPOT: savedState.spotScroll || 0, PURCHASE: returnState?.scroll || savedState.purchaseScroll || 0 });
    const [loading, setLoading] = useState(true); // ✅ 로딩 상태
    const requestVersion = useRef(0);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [spots, setSpots] = useState<SpotResponse[]>([]);
    const [purchases, setPurchases] = useState<SpotPurchaseResponse[]>([]);

    const [page, setPage] = useState(returnState?.page || 0);
    const [totalPages, setTotalPages] = useState(0);
    const [totalElements, setTotalElements] = useState(0);

    const [activePFilter, setActivePFilter] = useState<PurchaseSearchParams>(returnState?.filter || savedState.purchase || {});
    const [spotFilterVersion, setSpotFilterVersion] = useState(0);
    const [purchaseFilterVersion, setPurchaseFilterVersion] = useState(0);
    const [spotFilter, setSpotFilter] = useState<SpotSearchParams>(savedState.spot || {
        keyword: '',
        type: 'ALL',
        isVisit: 'ALL'
    });
    useEffect(() => {
        const main = document.querySelector('main');
        const save = () => sessionStorage.setItem(recordsKey, JSON.stringify({ spot: spotFilter, purchase: activePFilter, spotPage: rememberedPages.current.SPOT, purchasePage: rememberedPages.current.PURCHASE, spotScroll: rememberedScroll.current.SPOT, purchaseScroll: rememberedScroll.current.PURCHASE }));
        const onScroll = () => { rememberedScroll.current[viewMode] = main?.scrollTop || 0; save(); };
        main?.addEventListener('scroll', onScroll); save();
        return () => { main?.removeEventListener('scroll', onScroll); save(); };
    }, [recordsKey, spotFilter, activePFilter, viewMode, page]);
    useEffect(() => {
        let active = true;
        void getAllGroups().then(data => { if (active) { setGroups(data); setGroupError(''); if (groupRevision && initialGroupId && !data.some(g => g.id === initialGroupId)) { rememberedPages.current.SPOT = 0; setSearchParams(current => { const next = new URLSearchParams(current); next.delete('groupId'); next.delete('mode'); return next; }, { replace: true }); } } }).catch(() => { if (active) setGroupError('그룹 목록을 불러오지 못했습니다.'); });
        return () => { active = false; };
    }, [groupRevision, initialGroupId, setSearchParams]);

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
            rememberedPages.current.PURCHASE = data.number;
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
                isVisit: currentFilter.isVisit === 'ALL' ? undefined : currentFilter.isVisit,
                groupId: initialGroupId, ungrouped
            });
            if (version !== requestVersion.current) return;
            setSpots(data.content);
            setLoadError(null);
            if (viewMode === 'SPOT') {
                setTotalPages(data.totalPages);
                setTotalElements(data.totalElements);
                setPage(data.number);
                rememberedPages.current.SPOT = data.number;
            }
        } catch {
            if (version !== requestVersion.current) return;
            setLoadError('장소 목록을 불러오지 못했습니다.');
        } finally { if (version === requestVersion.current) setLoading(false); } // ✅ 로딩 종료
    }, [spotFilter, viewMode, initialGroupId, ungrouped]);

    useEffect(() => {
        if (viewMode === 'PURCHASE') {
            const initialPage = restorePending.current ? returnState?.page || 0 : rememberedPages.current.PURCHASE;
            restorePending.current = false;
            void fetchPurchasesData(initialPage).then(() => {
                requestAnimationFrame(() => { const main = document.querySelector('main'); if (main) main.scrollTop = rememberedScroll.current.PURCHASE; });
            });
        }
        else if (viewMode === 'SPOT') {
            void fetchSpotsData(rememberedPages.current.SPOT, spotFilter).then(() => requestAnimationFrame(() => { const main = document.querySelector('main'); if (main) main.scrollTop = rememberedScroll.current.SPOT; }));
        } else {
            setLoading(false);
        }
        const versionRef = requestVersion;
        return () => { versionRef.current++; };
    }, [viewMode, activePFilter, spotFilter, fetchPurchasesData, fetchSpotsData, returnState, groupRevision]);

    const handleSpotSearch = (newParams: SpotSearchParams) => {
        rememberedPages.current.SPOT = 0; rememberedScroll.current.SPOT = 0;
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
                showToast({ message: "기념품 정보를 수정했습니다.", type: 'success' });
            } else {
                await createPurchase(spotUserId, requestBody);
                showToast({ message: "기념품을 추가했습니다.", type: 'success' });
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
            recordVersion: item.recordVersion,
            itemName: item.itemName || '', kind: item.kind, category: item.category || '',
            price: item.price, currency: item.currency, status: item.status,
            quantity: item.quantity, acquiredDate: item.acquiredDate || '',
            note: item.note || '', spotUserId: item.spotUserId
        });
        setIsAdding(true);
    };

    const handleTogglePurchaseStatus = async (purchase: SpotPurchaseResponse) => {
        try {
            const nextStatus = purchase.status === 'ACQUIRED' ? 'WANT' : 'ACQUIRED';
            await updatePurchase(purchase.id, { ...purchase, status: nextStatus });
            await fetchPurchasesData(page);
            showToast({ message: '기념품 상태를 변경했습니다.', type: 'success' });
        } catch (error) {
            showToast({ message: error instanceof Error ? error.message : '기념품 상태를 변경하지 못했습니다.', type: 'error' });
        }
    };

    const handleDeletePurchase = async (purchaseId: number) => {
        const target = purchases.find(purchase => purchase.id === purchaseId);
        if (!await confirm({ title: '기념품 삭제', message: `'${target?.itemName || target?.spotName || '기념품'}'을 삭제할까요?${target?.goshuinBookId ? '\n고슈인첩에서도 제거되며 첨부 사진도 삭제됩니다.' : ''}`, confirmLabel: '삭제', danger: true })) return;
        try {
            await deletePurchase(purchaseId);
            await fetchPurchasesData(page);
            showToast({ message: '기념품을 삭제했습니다.', type: 'success' });
        } catch {
            showToast({ message: '기념품을 삭제하지 못했습니다.', type: 'error' });
        }
    };

    const spotLoading = loading && viewMode === 'SPOT';

    return (
        <RecordsPageLayout active={viewMode} beforeLeave={rememberLedger} busy={spotLoading}>

            {spotLoading && (
                <div role="status" aria-label="내 장소 불러오는 중" className="mb-3 flex items-center gap-2 text-sm text-gray-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />장소를 불러오는 중…
                </div>
            )}

            <div>
            <div data-guide-target="spots-content">
            {viewMode === 'SPOT' && (
                <div className="animate-in fade-in duration-300">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <select aria-label="장소 그룹 필터" className="yume-input min-w-0 flex-1 md:max-w-sm" value={ungrouped ? 'NONE' : initialGroupId || 'ALL'} onChange={e => { const value = e.target.value; rememberedPages.current.SPOT = 0; rememberedScroll.current.SPOT = 0; setSearchParams(current => { const next = new URLSearchParams(current); next.delete('mode'); next.delete('groupId'); next.delete('ungrouped'); if (value === 'NONE') next.set('ungrouped', 'true'); else if (value !== 'ALL') next.set('groupId', value); return next; }); }}>
                            <option value="ALL">전체 장소</option><option value="NONE">그룹 없음</option>{initialGroupId && !groups.some(g => g.id === initialGroupId) && <option value={initialGroupId}>선택한 그룹</option>}{groups.map(g => <option key={g.id} value={g.id}>{g.groupName} ({g.spotCount})</option>)}
                        </select><button className="yume-button yume-button-secondary" onClick={() => setManagingGroups(true)}>그룹 관리</button>
                    </div>
                    {groupError && <p role="alert" className="mb-3 text-sm text-red-700">{groupError}<button className="ml-2 min-h-11 text-blue-600" onClick={() => setGroupRevision(n => n + 1)}>재시도</button></p>}
                    <SpotFilter key={spotFilterVersion} initialFilter={spotFilter} onSearch={handleSpotSearch} />
                    <p className="mb-3 text-sm text-gray-500">장소 {totalElements}개</p>
                    {loadError && <LoadErrorState message={loadError} retrying={loading} onRetry={() => void fetchSpotsData(page, spotFilter)} />}
                    {(!loadError || spots.length > 0) && <SpotList spots={spots} onDelete={handleDeleteSpot} onToggleVisit={handleToggleVisit}
                        filtered={Boolean(initialGroupId || ungrouped || spotFilter.keyword.trim() || spotFilter.type !== 'ALL' || spotFilter.isVisit !== 'ALL')}
                        onReset={() => { setSearchParams({}); setSpotFilter({ keyword: '', type: 'ALL', isVisit: 'ALL' }); setSpotFilterVersion(version => version + 1); }} />}
                    <Pagination currentPage={page} totalPages={totalPages} onPageChange={(p) => fetchSpotsData(p, spotFilter)} />
                </div>
            )}

            {viewMode === 'PURCHASE' && (
                <div className="animate-in fade-in duration-300 space-y-6">
                    <PurchaseFilter
                        initialFilter={activePFilter}
                        key={purchaseFilterVersion}
                        selectedSpotName={purchases.find(purchase => purchase.id === editingId)?.spotName ?? undefined}
                        onSearch={filter => { rememberedPages.current.PURCHASE = 0; rememberedScroll.current.PURCHASE = 0; setActivePFilter(filter); }}
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
            </div>

            <SpotInUseModal
                isOpen={isInUseModalOpen}
                onClose={() => setIsInUseModalOpen(false)}
                usageList={conflictUsage}
                onSpotDeleteRetry={() => pendingDeleteId && handleDeleteSpot(pendingDeleteId, true)}
            />
            {managingGroups && <SpotGroupManager initialGroupId={initialGroupId} onClose={() => setManagingGroups(false)} onChanged={() => setGroupRevision(n => n + 1)} />}

        </RecordsPageLayout>
    );
}
