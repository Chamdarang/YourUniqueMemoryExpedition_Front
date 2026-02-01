import { useEffect, useState } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy
} from "@dnd-kit/sortable";

// API
import { getSchedulesByDay, syncSchedules } from "../../api/scheduleApi";
import { swapPlanDay, detachPlanDay } from "../../api/dayApi";

// Components
import ScheduleItem from "../schedule/ScheduleItem";
import PlanDaySwapModal from "./PlanDaySwapModal";

// Types
import type { DayScheduleResponse, ScheduleItemRequest } from "../../types/schedule";
import type { SwapMode } from "../../types/enums";
import { calculateEndTime } from "../../utils/timeUtils";

interface Props {
  dayId: number;
  dayName: string;
  onRefreshParent?: () => void;
  // ✅ [추가] 부모에게 수정 상태를 알리기 위한 콜백
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function DayScheduleEditor({ dayId, dayName, onRefreshParent, onDirtyChange }: Props) {
  const [schedules, setSchedules] = useState<DayScheduleResponse[]>([]);

  // 초기 상태 저장용 (변경 감지 및 초기화)
  const [initialSchedules, setInitialSchedules] = useState<DayScheduleResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);

  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

  const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 1. 데이터 로드
  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const data = await getSchedulesByDay(dayId);
      setSchedules(data);
      setInitialSchedules(data); // 원본 저장
      setIsDirty(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, [dayId]);

  // 2. 변경 감지 (Deep Compare - JSON Stringify)
  useEffect(() => {
    if (loading) return;
    const isChanged = JSON.stringify(schedules) !== JSON.stringify(initialSchedules);
    setIsDirty(isChanged);
  }, [schedules, initialSchedules, loading]);

  // ✅ [추가] Dirty 상태가 변경되면 부모에게 보고
  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(isDirty);
    }
    // 컴포넌트가 닫힐 때(언마운트)는 Dirty 상태 해제
    return () => {
      if (onDirtyChange) onDirtyChange(false);
    };
  }, [isDirty, onDirtyChange]);

  // 초기화 버튼 핸들러
  const handleReset = () => {
    if (!confirm("수정 사항을 모두 취소하고 처음 상태로 되돌리시겠습니까?")) return;
    setSchedules(JSON.parse(JSON.stringify(initialSchedules))); // 깊은 복사로 원복
  };

  // 3. 전체 저장
  const handleSaveAll = async () => {
    try {
      const syncReqItems: ScheduleItemRequest[] = schedules.map((item, index) => ({
        id: item.id < 0 ? null : item.id,
        spotId: item.spotId,
        scheduleOrder: index + 1,
        startTime: item.startTime,
        duration: item.duration,
        endTime: item.endTime,
        movingDuration: item.movingDuration,
        transportation: item.transportation,
        memo: item.memo,
        movingMemo: item.movingMemo
      }));

      const newSchedules = await syncSchedules(dayId, { schedules: syncReqItems });

      setSchedules(newSchedules);
      setInitialSchedules(newSchedules); // 저장 후 원본 갱신 (Dirty 해제 -> 부모에게 알림 감)

      alert("저장되었습니다! ✅");
    } catch { alert("저장 실패"); }
  };

  // 독립 (Detach)
  const handleDetach = async () => {
    if (!confirm(`'${dayName}' 일정을 여행에서 제외하고 보관함으로 옮기시겠습니까?`)) return;
    try {
      await detachPlanDay(dayId);
      alert("일정이 보관함으로 이동되었습니다.");
      if (onRefreshParent) onRefreshParent();
    } catch (err) {
      console.error(err);
      alert("작업 실패");
    }
  };

  // 이동 (Swap)
  const handleSwapSubmit = async (targetPlanId: number, targetDayOrder: number, swapMode: SwapMode) => {
    try {
      await swapPlanDay({
        sourceDayId: dayId,
        targetPlanId,
        targetDayOrder,
        swapMode
      });
      alert("이동되었습니다.");
      setIsSwapModalOpen(false);
      if (onRefreshParent) onRefreshParent();
    } catch (err) {
      console.error(err);
      alert("오류가 발생했습니다.");
    }
  };

  // 드래그 앤 드롭
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSchedules((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const updatedList= arrayMove(items, oldIndex, newIndex);

        return recalculateSchedules(updatedList);
      });
    }
  };

  // 로컬 업데이트 (메모리 상에서만 수정)
  const handleUpdateLocal = (id: number, updatedData: Partial<DayScheduleResponse>) => {
    setSchedules(prev => {

      const updatedList = prev.map(item =>
          item.id === id ? { ...item, ...updatedData } : item
      )
      return recalculateSchedules(updatedList);
    });

  };

  //"HH:mm" 문자열에 분을 더해서 새로운 "HH:mm" 반환
  const addMinutesToTime = (timeStr: string, minutesToAdd: number): string => {
    if (!timeStr) return "00:00";
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    date.setMinutes(date.getMinutes() + minutesToAdd);

    const newH = String(date.getHours()).padStart(2, '0');
    const newM = String(date.getMinutes()).padStart(2, '0');
    return `${newH}:${newM}`;
  };
  //전체 일정 시간 재계산 로직
  const recalculateSchedules = (items: DayScheduleResponse[]): DayScheduleResponse[] => {
    if (items.length === 0) return [];

    // 깊은 복사로 불변성 유지
    const newItems = items.map(item => ({ ...item }));

    // 첫 번째 아이템의 종료 시간 계산
    // (첫 번째 아이템의 startTime은 사용자가 입력한 값을 유지)
    newItems[0].endTime = addMinutesToTime(newItems[0].startTime, newItems[0].duration);

    // 두 번째 아이템부터 순차적으로 계산
    for (let i = 1; i < newItems.length; i++) {
      const prevItem = newItems[i - 1];
      const currentItem = newItems[i];

      // 1. 현재 시작 시간 = 이전 종료 시간 + 현재 이동 시간(movingDuration)
      // (movingDuration은 '이 장소로 오는데 걸리는 시간'으로 가정)
      const arrivalTime = addMinutesToTime(prevItem.endTime, currentItem.movingDuration);
      currentItem.startTime = arrivalTime;

      // 2. 현재 종료 시간 = 현재 시작 시간 + 체류 시간(duration)
      currentItem.endTime = addMinutesToTime(currentItem.startTime, currentItem.duration);
    }

    return newItems;
  };

  // 로컬 삭제
  const handleDeleteLocal = (targetId: number) => {
    if (targetId > 0 && !confirm("삭제하시겠습니까?")) return;
    setSchedules(prev => prev.filter(s => s.id !== targetId));
  };

  // 빈 일정 삽입
  const handleInsertEmpty = (insertIndex: number) => {
    let defaultStartTime = "10:00";
    if (insertIndex > 0) {
      const prev = schedules[insertIndex - 1];
      if (prev.startTime) defaultStartTime = calculateEndTime(prev.startTime, prev.duration);
    }

    const newItem: DayScheduleResponse = {
      id: -Date.now(),
      dayId, scheduleOrder: 0, spotId: 0, spotName: "", spotType: "OTHER",
      startTime: defaultStartTime, duration: 60, movingDuration: 0, transportation: 'WALK',
      memo: '', movingMemo: ''
    };

    setSchedules(prev => {
      const newList = [...prev];
      newList.splice(insertIndex, 0, newItem);
      return newList;
    });
  };

  if (loading) return <div className="p-8 text-center text-gray-400 text-sm">일정을 불러오는 중...</div>;

  return (
      <div className="bg-gray-50 rounded-b-2xl border-t border-gray-100 p-4 animate-fade-in-down">

        {/* 🛠️ 툴바 */}
        <div className="flex justify-between items-center mb-6">
          <div className="text-sm font-bold text-gray-500">
            📍 {schedules.length}개의 일정
          </div>
          <div className="flex gap-2">
            {/* 독립/이동 버튼 그룹 */}
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden mr-2">
              <button
                  onClick={handleDetach}
                  className="px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50 transition border-r border-gray-100"
                  title="일정을 보관함으로 빼기"
              >
                독립
              </button>
              <button
                  onClick={() => setIsSwapModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50 transition"
                  title="다른 날짜로 이동"
              >
                이동
              </button>
            </div>

            {/* 초기화 버튼 */}
            {isDirty && (
                <button
                    onClick={handleReset}
                    className="px-3 py-1.5 text-xs font-bold text-gray-500 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                >
                  ↺ 초기화
                </button>
            )}

            {/* 저장 버튼 */}
            <button
                onClick={handleSaveAll}
                disabled={!isDirty}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1
              ${isDirty
                    ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-200 transform active:scale-95'
                    : 'bg-white border border-green-200 text-green-600 cursor-default'}`}
            >
              {isDirty ? '💾 저장하기' : '✅ 저장됨'}
            </button>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={schedules.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0">
              {schedules.map((schedule, index) => (
                  <ScheduleItem
                      key={schedule.id}
                      schedule={schedule}
                      index={index}
                      isLast={index === schedules.length - 1}
                      onUpdate={handleUpdateLocal}
                      onDelete={() => handleDeleteLocal(schedule.id)}
                      onInsert={handleInsertEmpty}
                  />
              ))}

              {schedules.length === 0 && (
                  <div
                      className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-orange-300 hover:bg-orange-50/50 transition group"
                      onClick={() => handleInsertEmpty(0)}
                  >
                    <span className="text-4xl block mb-2 opacity-50 group-hover:opacity-100 transition">📝</span>
                    <p className="text-gray-400 text-sm font-bold group-hover:text-orange-500">여기를 눌러 첫 번째 장소를 추가하세요</p>
                  </div>
              )}

              {schedules.length > 0 && (
                  <button
                      onClick={() => handleInsertEmpty(schedules.length)}
                      className="w-full py-4 mt-6 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 font-bold text-sm hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50 transition"
                  >
                    + 맨 아래에 장소 추가
                  </button>
              )}
            </div>
          </SortableContext>
        </DndContext>

        <PlanDaySwapModal
            isOpen={isSwapModalOpen}
            onClose={() => setIsSwapModalOpen(false)}
            onSubmit={handleSwapSubmit}
            currentDayName={dayName}
        />
      </div>
  );
}