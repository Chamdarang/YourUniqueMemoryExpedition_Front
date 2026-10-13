import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

// API
import { getAllGroups, getGroupById, updateGroup, removeSpotFromGroup, deleteGroup } from "../../api/groupApi";

// Types
import type { SpotResponse } from "../../types/spot";
import type { SpotGroupResponse } from "../../types/groups";

// Components
import SpotList from "./SpotList";
import { useFeedback } from '../common/useFeedback';
import LoadErrorState from '../common/LoadErrorState';

interface Props {
  initialGroupId?: number;
}

export default function SpotGroupList({ initialGroupId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, showToast } = useFeedback();
  // ----------------------------------------------------------------
  // 🧠 State
  // ----------------------------------------------------------------
  const [groups, setGroups] = useState<SpotGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  // 선택된 그룹 상태 (Detail View)
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState("");
  const [groupSpots, setGroupSpots] = useState<SpotResponse[]>([]);

  // 수정 모드 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  // ----------------------------------------------------------------
  // ⚙️ Effects & Data Fetching
  // ----------------------------------------------------------------

  const fetchGroups = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const data = await getAllGroups();
      if (version !== requestVersion.current) return null;
      setGroups(data);
      setListError(null);
      return data;
    } catch {
      if (version === requestVersion.current) setListError('그룹 목록을 불러오지 못했습니다.');
      return null;
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  const loadGroup = useCallback(async (groupId: number) => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const data = await getGroupById(groupId);
      if (version !== requestVersion.current) return;
      setGroupSpots(data.spots);
      setSelectedGroupName(data.groupName);
      setDetailError(null);
    } catch {
      if (version === requestVersion.current) setDetailError('그룹의 장소를 불러오지 못했습니다.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  const handleGroupClick = (groupId: number, groupName: string) => {
    setSelectedGroupId(groupId);
    setSelectedGroupName(groupName);
    setGroupSpots([]);
    setDetailError(null);
    setIsEditing(false);
    void loadGroup(groupId);
  };

  useEffect(() => {
    let active = true;
    void fetchGroups().then(data => {
      const target = data?.find(group => group.id === initialGroupId);
      if (!active || !target) return;
      setSelectedGroupId(target.id);
      setSelectedGroupName(target.groupName);
      void loadGroup(target.id);
    });
    const versionRef = requestVersion;
    return () => { active = false; versionRef.current++; };
  }, [fetchGroups, loadGroup, initialGroupId]);

  // 목록으로 돌아가기
  const handleBack = () => {
    setSelectedGroupId(null);
    setGroupSpots([]);
    setDetailError(null);
    setIsEditing(false);
    if (searchParams.has('groupId')) {
      setSearchParams(current => {
        const next = new URLSearchParams(current);
        next.delete('groupId');
        return next;
      }, { replace: true });
    } else {
      void fetchGroups(); // 그룹별 장소 개수 등 최신화
    }
  };

  // 그룹 이름 수정 시작
  const startEditing = () => {
    setEditName(selectedGroupName);
    setIsEditing(true);
  };

  // 그룹 이름 저장
  const handleRenameGroup = async () => {
    if (!selectedGroupId || !editName.trim()) return;
    try {
      await updateGroup(selectedGroupId, { groupName: editName });
      setSelectedGroupName(editName);
      setIsEditing(false);
      showToast({ message: "그룹 이름을 변경했습니다.", type: 'success' });
      fetchGroups(); // 목록 갱신
    } catch {
      showToast({ message: "이미 존재하는 그룹 이름이거나 수정하지 못했습니다.", type: 'error' });
    }
  };

  // 그룹 삭제
  const handleDeleteGroup = async () => {
    if (!selectedGroupId) return;
    if (!await confirm({ title: '장소 그룹 삭제', message: `'${selectedGroupName}' 그룹을 삭제할까요?\n포함된 장소는 삭제되지 않고 그룹만 해제됩니다.`, confirmLabel: '그룹 삭제', danger: true })) return;

    try {
      await deleteGroup(selectedGroupId);
      showToast({ message: "그룹을 삭제했습니다.", type: 'success' });
      handleBack();
    } catch {
      showToast({ message: "그룹을 삭제하지 못했습니다.", type: 'error' });
    }
  };

  // 그룹에서 장소 제외
  const handleRemoveSpotFromGroup = async (spotId: number) => {
    if (!selectedGroupId) return;
    if (!await confirm({ title: '그룹에서 제외', message: '이 장소를 그룹에서 제외할까요?', confirmLabel: '제외' })) return;

    try {
      await removeSpotFromGroup(selectedGroupId, spotId);
      setGroupSpots(prev => prev.filter(s => s.id !== spotId)); // UI 낙관적 업데이트
      fetchGroups(); // 백그라운드 데이터 갱신
      showToast({ message: '장소를 그룹에서 제외했습니다.', type: 'success' });
    } catch {
      showToast({ message: "장소를 그룹에서 제외하지 못했습니다.", type: 'error' });
    }
  };

  // ----------------------------------------------------------------
  // 🖼️ UI Rendering
  // ----------------------------------------------------------------

  // 로딩 중이면서 데이터가 없을 때
  if (loading && !listError && !selectedGroupId && groups.length === 0) {
    return <div role="status" className="text-center p-12 text-gray-600">그룹을 불러오는 중...</div>;
  }

  return (
      <div className="animate-fade-in" aria-busy={loading}>
        {listError && <LoadErrorState message={listError} retrying={loading} onRetry={() => void fetchGroups()} />}
        {detailError && selectedGroupId && <LoadErrorState message={detailError} retrying={loading} onRetry={() => void loadGroup(selectedGroupId)} />}
        {loading && <p role="status" className="mb-4 text-sm text-gray-600">그룹 정보를 불러오는 중...</p>}

        {selectedGroupId ? (
            // 🅰️ [상세 뷰] 그룹 내부 (장소 목록)
            <div>
              <button
                  onClick={handleBack}
                  className="yume-button yume-button-secondary mb-4"
              >
                ← 그룹 목록
              </button>

              <div className="yume-card mb-4 p-4 md:p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                  {/* 타이틀 영역 (수정 모드 분기) */}
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-lg" aria-hidden="true">📂</span>

                    {isEditing ? (
                        <div className="flex flex-wrap gap-2 w-full md:w-auto min-w-0">
                          <input
                              type="text" aria-label="그룹 이름"
                              className="yume-input min-w-0 w-full font-bold"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              autoFocus
                          />
                          <button onClick={handleRenameGroup} className="yume-button yume-button-primary whitespace-nowrap">저장</button>
                          <button onClick={() => setIsEditing(false)} className="yume-button yume-button-secondary whitespace-nowrap">취소</button>
                        </div>
                    ) : (
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-extrabold text-gray-900">{selectedGroupName}</h2>
                          <p className="mt-0.5 text-sm text-gray-500">장소 {groupSpots.length}개</p>
                        </div>
                    )}
                  </div>

                  {/* 관리 버튼 */}
                  {!isEditing && (
                      <div className="flex gap-2">
                        <button
                            onClick={startEditing}
                            className="yume-button yume-button-soft"
                        >
                          ✏️ 이름 변경
                        </button>
                        <button
                            onClick={handleDeleteGroup}
                            className="yume-button yume-button-danger-outline"
                        >
                          🗑️ 그룹 삭제
                        </button>
                      </div>
                  )}
                </div>
              </div>

              {/* 장소 리스트 */}
              <div>
                {groupSpots.length === 0 ? (!loading && !detailError && (
                    <div className="text-center py-12">
                      <p className="text-gray-400">이 그룹에 저장된 장소가 없습니다.</p>
                    </div>
                )) : (
                    <SpotList
                        spots={groupSpots}
                        onDelete={handleRemoveSpotFromGroup}
                    />
                )}
              </div>
            </div>
        ) : (
            // 🅱️ [목록 뷰] 그룹 리스트 (폴더 아이콘)
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {groups.length === 0 ? (!listError && (
                  <div className="yume-empty-state col-span-full py-20 text-center">
                    <p className="text-gray-400">만든 그룹이 아직 없습니다.</p>
                    <p className="text-xs text-gray-400 mt-2">장소 상세의 그룹 관리에서 그룹을 추가할 수 있습니다.</p>
                  </div>
              )) : (
                  groups.map(group => (
                      <button type="button" aria-label={`${group.groupName} 그룹 열기`}
                          key={group.id}
                          onClick={() => handleGroupClick(group.id, group.groupName)}
                          className="yume-card yume-card-interactive text-left min-h-11 p-5 cursor-pointer group relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition">
                          <span className="text-6xl">📂</span>
                        </div>

                        <div className="relative z-10">
                          <div className="text-3xl mb-3">
                            {group.spotCount > 0 ? '📂' : '📁'}
                          </div>
                          <h3 className="font-bold text-gray-800 text-lg truncate">#{group.groupName}</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            <span className="font-bold text-blue-600">{group.spotCount}</span>개의 장소
                          </p>
                        </div>
                      </button>
                  ))
              )}
            </div>
        )}
      </div>
  );
}
