import { useEffect, useState } from "react";

// API
import { getAllGroups, getGroupById, updateGroup, removeSpotFromGroup, deleteGroup } from "../../api/groupApi";

// Types
import type { SpotResponse } from "../../types/spot";
import type { SpotGroupResponse } from "../../types/groups";

// Components
import SpotList from "./SpotList";

interface Props {
  initialGroupName?: string; // URL 타고 들어왔을 때 자동 진입용
}

export default function SpotGroupList({ initialGroupName }: Props) {
  // ----------------------------------------------------------------
  // 🧠 State
  // ----------------------------------------------------------------
  const [groups, setGroups] = useState<SpotGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);

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

  // 그룹 목록 로드
  const fetchGroups = async () => {
    try {
      setLoading(true);
      const data = await getAllGroups();
      setGroups(data);

      // URL 파라미터가 있고, 아직 선택된 그룹이 없다면 자동 진입
      if (initialGroupName && !selectedGroupId) {
        const target = data.find(g => g.groupName === initialGroupName);
        if (target) {
          handleGroupClick(target.id, target.groupName);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------------------------------------------------
  // 🎮 Handlers
  // ----------------------------------------------------------------

  // 그룹 상세 진입
  const handleGroupClick = async (groupId: number, groupName: string) => {
    try {
      setLoading(true);
      const data = await getGroupById(groupId);
      setGroupSpots(data.spots);
      setSelectedGroupName(groupName);
      setSelectedGroupId(groupId);
      setIsEditing(false);
    } catch {
      alert("그룹 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 목록으로 돌아가기
  const handleBack = () => {
    setSelectedGroupId(null);
    setGroupSpots([]);
    setIsEditing(false);
    fetchGroups(); // 그룹별 장소 개수 등 최신화
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
      alert("그룹 이름이 변경되었습니다.");
      fetchGroups(); // 목록 갱신
    } catch {
      alert("이미 존재하는 그룹 이름이거나 수정에 실패했습니다.");
    }
  };

  // 그룹 삭제
  const handleDeleteGroup = async () => {
    if (!selectedGroupId) return;
    if (!window.confirm(`'${selectedGroupName}' 그룹을 정말 삭제하시겠습니까?\n(포함된 장소들은 삭제되지 않고 그룹만 해제됩니다.)`)) return;

    try {
      await deleteGroup(selectedGroupId);
      alert("그룹이 삭제되었습니다.");
      handleBack();
    } catch {
      alert("그룹 삭제 실패");
    }
  };

  // 그룹에서 장소 제외
  const handleRemoveSpotFromGroup = async (spotId: number) => {
    if (!selectedGroupId) return;
    if (!window.confirm("이 장소를 그룹에서 제외하시겠습니까?")) return;

    try {
      await removeSpotFromGroup(selectedGroupId, spotId);
      setGroupSpots(prev => prev.filter(s => s.id !== spotId)); // UI 낙관적 업데이트
      fetchGroups(); // 백그라운드 데이터 갱신
    } catch {
      alert("제외 실패");
    }
  };

  // ----------------------------------------------------------------
  // 🖼️ UI Rendering
  // ----------------------------------------------------------------

  // 로딩 중이면서 데이터가 없을 때
  if (loading && !selectedGroupId && groups.length === 0) {
    return <div className="text-center p-20 text-gray-400">그룹 로딩 중... 📂</div>;
  }

  return (
      <div className="animate-fade-in">

        {selectedGroupId ? (
            // 🅰️ [상세 뷰] 그룹 내부 (장소 목록)
            <div>
              <button
                  onClick={handleBack}
                  className="mb-4 flex items-center text-sm font-bold text-gray-500 hover:text-blue-600 transition"
              >
                ← 📂 그룹 목록으로 돌아가기
              </button>

              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                  {/* 타이틀 영역 (수정 모드 분기) */}
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-3xl">🏷️</span>

                    {isEditing ? (
                        <div className="flex gap-2 w-full md:w-auto">
                          <input
                              type="text"
                              className="px-3 py-2 border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-800"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              autoFocus
                          />
                          <button onClick={handleRenameGroup} className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-sm whitespace-nowrap hover:bg-blue-700">저장</button>
                          <button onClick={() => setIsEditing(false)} className="bg-white text-gray-600 border border-gray-300 px-3 py-2 rounded-lg font-bold text-sm whitespace-nowrap hover:bg-gray-50">취소</button>
                        </div>
                    ) : (
                        <div>
                          <h2 className="text-xl font-bold text-blue-900">#{selectedGroupName}</h2>
                          <p className="text-sm text-blue-600">총 {groupSpots.length}개의 장소</p>
                        </div>
                    )}
                  </div>

                  {/* 관리 버튼 */}
                  {!isEditing && (
                      <div className="flex gap-2">
                        <button
                            onClick={startEditing}
                            className="px-3 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-50 transition"
                        >
                          ✏️ 이름 변경
                        </button>
                        <button
                            onClick={handleDeleteGroup}
                            className="px-3 py-2 bg-white border border-red-200 text-red-500 rounded-lg text-sm font-bold hover:bg-red-50 transition"
                        >
                          🗑️ 그룹 삭제
                        </button>
                      </div>
                  )}
                </div>
              </div>

              {/* 장소 리스트 */}
              <div className="bg-white rounded-xl border border-gray-100 p-1">
                {groupSpots.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-400">이 그룹에 저장된 장소가 없습니다.</p>
                    </div>
                ) : (
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
              {groups.length === 0 ? (
                  <div className="col-span-full text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <p className="text-gray-400">생성된 그룹이 없습니다.</p>
                    <p className="text-xs text-gray-400 mt-2">장소 상세화면에서 태그를 추가하면 그룹이 생성됩니다.</p>
                  </div>
              ) : (
                  groups.map(group => (
                      <div
                          key={group.id}
                          onClick={() => handleGroupClick(group.id, group.groupName)}
                          className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition group relative overflow-hidden"
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
                      </div>
                  ))
              )}
            </div>
        )}
      </div>
  );
}