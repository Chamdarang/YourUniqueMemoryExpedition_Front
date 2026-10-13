import type { PurchaseFormValue } from '../components/purchase/PurchaseForm';
import { useCallback, useEffect, useRef, useState } from 'react';
import LoadErrorState from '../components/common/LoadErrorState';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';

// API
import { getSpotDetail, updateSpot } from '../api/spotApi';
import { createPurchase, updatePurchase, deletePurchase } from '../api/purchaseApi';
import { getAllGroups, createGroup, addSpotToGroup, removeSpotFromGroup } from '../api/groupApi';

// Types
import type { SpotDetailResponse, SpotUpdateRequest } from '../types/spot';
import type { SpotPurchaseSaveRequest, SpotPurchaseResponse } from '../types/purchase';
import type { SpotType } from '../types/enums';

// Utils & Components
import { getSpotDisplayName, getSpotTypeInfo, SPOT_TYPE_INFO } from '../utils/spotUtils';
import PurchaseEditCard from '../components/purchase/PurchaseEditCard.tsx';
import SpotGroupModal from '../components/spot/SpotGroupModal';
import {AdvancedMarker, APIProvider, Map, Pin} from "@vis.gl/react-google-maps";
import { useFeedback } from '../components/common/useFeedback';

// ❌ 기존에 중복 정의되어 있던 getStatusInfo 함수를 삭제했습니다.

function toEditForm(data: SpotDetailResponse): SpotUpdateRequest {
    return {
                spotName: getSpotDisplayName(data), spotType: data.spotType, address: data.address,
                shortAddress: data.shortAddress || '', website: data.website || '',
                googleMapUrl: data.googleMapUrl || '', lat: data.lat, lng: data.lng,
                isVisit: data.isVisit, description: data.description || '', metadata: data.metadata || {}
            };
}

export default function SpotDetailPage() {
    const { confirm, showToast } = useFeedback();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [spot, setSpot] = useState<SpotDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const savingRef = useRef(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const blockerPromptActive = useRef(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const requestVersion = useRef(0);
    const editingRef = useRef(isEditing);
    useEffect(() => { editingRef.current = isEditing; }, [isEditing]);

    // 쇼핑 아이템 관련 상태
    const [isAddingPurchase, setIsAddingPurchase] = useState(false);
    const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);

    const initialPurchaseState: SpotPurchaseSaveRequest = {
        kind: 'SOUVENIR',
        category: '',
        itemName: '',
        price: 0,
        currency: 'JPY',
        status: 'WANT',
        quantity: 1,
        acquiredDate: new Date().toISOString().split('T')[0],
        note: ''
    };

    const [newPurchase, setNewPurchase] = useState<SpotPurchaseSaveRequest>(initialPurchaseState);
    const [editPurchaseForm, setEditPurchaseForm] = useState<SpotPurchaseSaveRequest>(initialPurchaseState);

    // 장소 수정 폼 상태
    const [editForm, setEditForm] = useState<SpotUpdateRequest>({
        spotName: '', spotType: 'OTHER',
        isVisit: false, description: '', metadata: {}
    });

    const isDirty = isSaving || Boolean(isEditing && spot && (
        editForm.spotName !== getSpotDisplayName(spot)
        || editForm.spotType !== spot.spotType
        || editForm.description !== (spot.description || '')
    ));
    const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (!isDirty) return;
        const protectReload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', protectReload);
        return () => window.removeEventListener('beforeunload', protectReload);
    }, [isDirty]);
    useEffect(() => {
        if (blocker.state !== 'blocked' || blockerPromptActive.current) return;
        blockerPromptActive.current = true;
        void confirm({ title: '저장되지 않은 변경사항', message: '저장되지 않았거나 저장 중인 장소 정보가 있습니다. 이 화면을 떠날까요?', confirmLabel: '화면 떠나기', danger: true })
            .then(leave => { if (leave) blocker.proceed(); else blocker.reset(); })
            .finally(() => { blockerPromptActive.current = false; });
    }, [blocker, confirm]);

    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

    const fetchDetail = useCallback(async () => {
        const version = ++requestVersion.current;
        try {
            setLoading(true);
            if (!id || !Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error('invalid id');
            const data = await getSpotDetail(Number(id));
            if (version !== requestVersion.current) return;
            setSpot(data);
            setLoadError(null);
            if (!editingRef.current) setEditForm(toEditForm(data));
        } catch {
            if (version === requestVersion.current) setLoadError('장소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally { if (version === requestVersion.current) setLoading(false); }
    }, [id]);

    useEffect(() => {
        void fetchDetail();
        const versionRef = requestVersion;
        return () => { versionRef.current++; };
    }, [fetchDetail]);

    const handleUpdateSpot = async () => {
        if (!id || savingRef.current) return;
        const spotName = editForm.spotName?.trim() || '';
        if (!spotName) {
            setNameError('장소 이름을 입력해 주세요.');
            nameInputRef.current?.focus();
            return;
        }
        const value: SpotUpdateRequest = { spotName, spotType: editForm.spotType, description: editForm.description };
        savingRef.current = true;
        setIsSaving(true);
        setSaveError(null);
        setNameError(null);
        try {
            await updateSpot(Number(id), value);
            setIsEditing(false);
            await fetchDetail();
            showToast({ message: '장소 정보를 수정했습니다.', type: 'success' });
        } catch {
            setSaveError('장소 정보를 저장하지 못했습니다. 입력은 유지되어 있으니 다시 시도해 주세요.');
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    const handleToggleVisit = async () => {
        if (!spot || !id) return;
        try {
            await updateSpot(Number(id), { isVisit: !spot.isVisit });
            fetchDetail();
        } catch { showToast({ message: "방문 상태를 바꾸지 못했습니다.", type: 'error' }); }
    };

    const handleAddPurchase = async (value: PurchaseFormValue) => {
        if (!id) throw new Error('장소를 찾을 수 없습니다.');
        await createPurchase(Number(id), value);
        setIsAddingPurchase(false);
        setNewPurchase(initialPurchaseState);
        fetchDetail();
        showToast({ message: '기념품을 추가했습니다.', type: 'success' });
    };

    const handleUpdatePurchase = async (purchaseId: number, value: PurchaseFormValue) => {
        await updatePurchase(purchaseId, value);
        setEditingPurchaseId(null);
        fetchDetail();
        showToast({ message: '기념품 정보를 수정했습니다.', type: 'success' });
    };

    const handleDeletePurchase = async (purchaseId: number) => {
        if (!await confirm({ title: '기념품 삭제', message: '이 기념품을 삭제할까요? 첩에 연결된 고슈인이면 첩에서도 제거되고 첨부 사진도 삭제됩니다.', confirmLabel: '삭제', danger: true })) return;
        try {
            await deletePurchase(purchaseId);
            fetchDetail();
            showToast({ message: '기념품을 삭제했습니다.', type: 'success' });
        } catch { showToast({ message: "기념품을 삭제하지 못했습니다.", type: 'error' }); }
    };

    const handleOpenGroup = async (groupName: string) => {
        try {
            const groups = await getAllGroups();
            const group = groups.find(item => item.groupName === groupName);
            if (!group) {
                showToast({ message: '그룹 정보를 찾지 못했습니다. 그룹 목록을 새로고침해 주세요.', type: 'error' });
                return;
            }
            navigate(`/spots?groupId=${group.id}`);
        } catch {
            showToast({ message: '그룹으로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.', type: 'error' });
        }
    };

    const handleSaveGroups = async (newTags: string[]) => {
        if (!id || !spot) return;
        try {
            const allGroups = await getAllGroups();
            const oldTags = spot.groupName;
            const toRemove = oldTags.filter(t => !newTags.includes(t));
            for (const name of toRemove) {
                const group = allGroups.find(g => g.groupName === name);
                if (group) await removeSpotFromGroup(group.id, Number(id));
            }
            const toAdd = newTags.filter(t => !oldTags.includes(t));
            for (const name of toAdd) {
                let group = allGroups.find(g => g.groupName === name);
                if (!group) group = await createGroup({ groupName: name });
                await addSpotToGroup(group.id, Number(id));
            }
            fetchDetail();
            setIsGroupModalOpen(false);
            showToast({ message: '장소 그룹을 저장했습니다.', type: 'success' });
        } catch { showToast({ message: "장소 그룹을 저장하지 못했습니다.", type: 'error' }); }
    };

    const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
    if (!spot || spot.id !== Number(id)) return <div className="max-w-3xl mx-auto p-6 space-y-4">
        {loadError ? <LoadErrorState message={loadError} retrying={loading} onRetry={() => void fetchDetail()} />
            : <p role="status" className="text-center p-12 text-gray-600">장소 정보를 불러오는 중...</p>}
        <button type="button" onClick={() => navigate('/spots')} className="yume-button yume-button-secondary">장소 목록으로</button>
    </div>;

    const currentTypeInfo = getSpotTypeInfo(spot.spotType);
    const googleMapsUrl = spot.googleMapUrl || `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['maps', 'marker']} language="ko">
            <div className="max-w-6xl mx-auto p-4 md:p-8 pb-32 space-y-6 bg-gray-50/30 min-h-screen font-sans">
                {loadError && <LoadErrorState message={loadError} retrying={loading} onRetry={() => void fetchDetail()} />}

                {/* 🏠 메인 정보 카드 */}
                <div data-guide-target="spot-detail-main" className="yume-card overflow-hidden flex flex-col lg:flex-row">
                    <div className="min-w-0 lg:w-2/3 p-4 md:p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <button type="button" onClick={() => navigate('/spots')} className="yume-button yume-button-secondary rounded-full">← 목록</button>
                                <button type="button" aria-pressed={spot.isVisit} disabled={isSaving} onClick={handleToggleVisit} className={`yume-button rounded-full ${spot.isVisit ? 'yume-button-success' : 'yume-button-warm'}`}>
                                    {spot.isVisit ? '✓ 방문 완료' : '+ 방문 체크'}
                                </button>
                            </div>

                            {isEditing ? (
                                <form aria-label="장소 정보 수정" noValidate onSubmit={event => { event.preventDefault(); void handleUpdateSpot(); }} className="space-y-4 animate-in fade-in">
                                    <fieldset disabled={isSaving} className="space-y-4 disabled:opacity-70">
                                    <label htmlFor="spot-edit-name" className="block text-sm font-bold text-gray-700">장소 이름 (필수)</label>
                                    <input id="spot-edit-name" ref={nameInputRef} maxLength={200} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'spot-name-error' : undefined} aria-label="장소 이름" className="yume-input text-xl font-bold" value={editForm.spotName} onChange={e => setEditForm({...editForm, spotName: e.target.value})} autoFocus />
                                    {nameError && <p id="spot-name-error" role="alert" className="text-sm text-red-700">{nameError}</p>}
                                    <label htmlFor="spot-edit-type" className="block text-sm font-bold text-gray-700">장소 유형</label>
                                    <select id="spot-edit-type" className="yume-input yume-input-soft font-bold" value={editForm.spotType} onChange={e => setEditForm({...editForm, spotType: e.target.value as SpotType})}>
                                        {Object.entries(SPOT_TYPE_INFO).map(([key, info]) => (
                                            <option key={key} value={key}>{info.icon} {info.label}</option>
                                        ))}
                                    </select>
                                    <label htmlFor="spot-edit-description" className="block text-sm font-bold text-gray-700">설명 (선택)</label>
                                    <textarea id="spot-edit-description" className="yume-input yume-input-soft min-h-[100px] resize-none" value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} placeholder="설명을 입력하세요." />
                                    <div className="flex gap-2">
                                        <button type="submit" className="yume-button yume-button-primary px-6">{isSaving ? '저장 중…' : saveError ? '저장 다시 시도' : '저장'}</button>
                                        <button type="button" onClick={() => { setIsEditing(false); setEditForm(toEditForm(spot)); setSaveError(null); setNameError(null); }} className="yume-button yume-button-secondary px-6">취소</button>
                                    </div>
                                    </fieldset>
                                    {saveError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
                                    <p role="status" className="text-xs text-gray-600">{isSaving ? '장소 정보를 저장하고 있습니다.' : isDirty ? '저장되지 않은 변경사항이 있습니다.' : '변경한 정보를 저장해 주세요.'}</p>
                                </form>
                            ) : (
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-snug break-words tracking-tight">{getSpotDisplayName(spot)}</h1>
                                    <div className="flex flex-wrap items-center gap-3 mt-4">
                                        <span className={`px-4 py-2 rounded-xl text-sm font-black shadow-sm flex items-center gap-2 ${currentTypeInfo.color}`}>
                                            {currentTypeInfo.icon} {currentTypeInfo.label}
                                        </span>
                                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="yume-button yume-button-soft">🗺️ 구글 지도</a>
                                        <button onClick={() => { setEditForm(toEditForm(spot)); setSaveError(null); setNameError(null); setIsEditing(true); }} className="yume-button yume-button-ghost text-xs">✏️ 정보 수정</button>
                                    </div>
                                    <p className="text-gray-600 text-sm md:text-base border-t border-gray-100 mt-4 pt-4 leading-relaxed whitespace-pre-wrap break-words">
                                        {spot.description || "등록된 설명이 없습니다."}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="w-full lg:w-1/3 h-48 lg:h-auto lg:min-h-64 border-t lg:border-t-0 lg:border-l border-gray-100 relative bg-gray-200">
                        {GOOGLE_MAPS_API_KEY && spot && (
                            <Map defaultCenter={{ lat: spot.lat, lng: spot.lng }} defaultZoom={15} mapId="SPOT_HERO" disableDefaultUI={true} className="w-full h-full">
                                <AdvancedMarker position={{ lat: spot.lat, lng: spot.lng }}>
                                    <Pin background={currentTypeInfo.hex} glyphColor={'#fff'} borderColor={currentTypeInfo.hex} scale={1.2} />
                                </AdvancedMarker>
                            </Map>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 space-y-6">
                        {/* 🕒 방문 히스토리 */}
                        <div data-guide-target="spot-detail-history" className="yume-card p-4 md:p-6">
                            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4 flex items-center gap-3">
                                <span className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-lg">🗓</span> 방문 히스토리
                            </h3>
                            {spot.isVisit && spot.spotVisitHistory?.length > 0 ? (
                                <div className="relative border-l-2 border-blue-100 ml-4 pl-8 space-y-8">
                                    {spot.spotVisitHistory.map((h) => (
                                        <div key={h.id} className="relative group cursor-pointer" onClick={() => navigate(!h.planId ? `/days/${h.dayId}` : `/plans/${h.planId}`)}>
                                            <div className="absolute -left-[33px] top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-white shadow-sm" />
                                            <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 group-hover:bg-white group-hover:shadow-lg transition-all">
                                                <span className="text-xs font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full mb-2 inline-block uppercase tracking-widest">{h.visitedAt}</span>
                                                <h4 className="font-black text-gray-800 text-lg">{!h.planId ? `[개별 일정] ${h.dayName}` : h.planName}</h4>
                                                {h.planId && <p className="text-xs text-gray-600 font-bold mt-1 uppercase tracking-tighter">{h.dayName} 스케줄</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-6 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500 text-sm">기록이 없습니다.</div>
                            )}
                        </div>

                        {/* 🛍️ 기념품 기록 섹션 */}
                        <div className="yume-card p-4 md:p-6">
                            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                                <h3 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-3">
                                    <span className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-lg">🛍</span> 기념품 기록
                                </h3>
                                <button onClick={() => setIsAddingPurchase(!isAddingPurchase)} className={`yume-button ${isAddingPurchase ? 'yume-button-secondary' : 'yume-button-primary'}`}>
                                    {isAddingPurchase ? '닫기' : '+ 새 기념품 추가'}
                                </button>
                            </div>

                            {!isAddingPurchase && spot.purchases.length === 0 && <p className="py-6 text-center text-sm text-gray-500">등록된 기념품이 없습니다.</p>}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* ✅ getStatusInfo 프롭 제거 (PurchaseCard 내부에서 유틸 사용) */}
                                {isAddingPurchase && (
                                    <PurchaseEditCard
                                        spotName={getSpotDisplayName(spot)}
                                        mode="add"
                                        form={newPurchase}
                                        onChange={(updates) => setNewPurchase(prev => ({ ...prev, ...updates }))}
                                        onSave={handleAddPurchase}
                                        onCancel={() => setIsAddingPurchase(false)}
                                    />
                                )}

                                {spot.purchases.map((p: SpotPurchaseResponse) => (
                                    <PurchaseEditCard
                                        key={`${p.id}:${editingPurchaseId === p.id ? 'edit' : 'view'}`}
                                        spotName={getSpotDisplayName(spot)}
                                        mode={editingPurchaseId === p.id ? 'edit' : 'view'}
                                        data={p}
                                        form={editPurchaseForm}
                                        onChange={(updates) => setEditPurchaseForm(prev => ({ ...prev, ...updates }))}
                                        onSave={value => handleUpdatePurchase(p.id, value)}
                                        onCancel={() => setEditingPurchaseId(null)}
                                        onDelete={handleDeletePurchase}
                                        onEditMode={(item) => {
                                            setEditingPurchaseId(item.id);
                                            setEditPurchaseForm(item);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                        {/* 📋 사이드바: 그룹 태그 */}
                        <div className="yume-card p-4 md:p-6">
                            <div className="flex justify-between items-center mb-6 px-1">
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest">그룹 태그</h3>
                                <button onClick={() => setIsGroupModalOpen(true)} className="text-blue-500 font-black text-xs hover:underline transition-all">편집</button>
                            </div>
                            <div className="flex flex-wrap gap-2.5">
                                {spot.groupName.length > 0 ? spot.groupName.map((name) => (
                                    <button key={name} type="button" onClick={() => void handleOpenGroup(name)} aria-label={`${name} 그룹 상세로 이동`} className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">#{name}</button>
                                )) : <span className="text-gray-500 text-xs italic font-bold">지정된 그룹 없음</span>}
                            </div>
                        </div>

                        {/* 📋 사이드바: 장소 상세 정보 */}
                        <div className="yume-card p-4 md:p-6 space-y-6">
                            <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest">장소 상세 정보</h3>
                            <div className="space-y-6 px-1">
                                <div className="space-y-2">
                                    <p className="text-xs font-black text-blue-500 uppercase mb-1 tracking-widest">기본 주소</p>
                                    <p className="text-gray-900 font-bold text-sm leading-relaxed break-keep">{spot.shortAddress || spot.address}</p>
                                    {spot.shortAddress && <p className="text-xs text-gray-600 font-medium leading-relaxed">{spot.address}</p>}
                                </div>
                                {spot.website && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-black text-blue-500 uppercase mb-1 tracking-widest">홈페이지</p>
                                        <a href={spot.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold underline transition break-all text-xs">{spot.website}</a>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <SpotGroupModal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)} currentGroups={spot.groupName} onSave={handleSaveGroups} />
            </div>
        </APIProvider>
    );
}
