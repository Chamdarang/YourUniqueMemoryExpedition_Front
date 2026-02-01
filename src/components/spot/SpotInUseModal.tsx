import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

// ✅ [수정] 주석 해제 (scheduleApi에서 가져오기)
import { deleteSchedule } from "../../api/scheduleApi";

// Types (경로에 .ts 제거)
import type {UsedScheduleResponse} from "../../types/error.ts";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    usageList: UsedScheduleResponse[];
    onSpotDeleteRetry: () => void;
}

export default function SpotInUseModal({ isOpen, onClose, usageList, onSpotDeleteRetry }: Props) {
    const [conflicts, setConflicts] = useState<UsedScheduleResponse[]>([]);

    useEffect(() => {
        if (isOpen) {
            setConflicts(usageList);
        }
    }, [isOpen, usageList]);

    const handleRemoveSchedule = async (scheduleId: number) => {
        if (!confirm("이 일정에서만 장소를 제외하시겠습니까?")) return;

        try {
            // ✅ [수정] 주석을 풀고 실제 API 호출!
            await deleteSchedule(scheduleId);
            console.log(`스케줄 ${scheduleId} 삭제 완료`);

            // 성공 시 목록에서 제거 (UI 갱신)
            const remaining = conflicts.filter(c => c.scheduleId !== scheduleId);
            setConflicts(remaining);

            // 3. 더 이상 사용 중인 곳이 없다면? -> 장소 삭제 재시도
            if (remaining.length === 0) {
                // 이제 서버에서도 스케줄이 다 지워졌으므로 장소 삭제가 성공할 것입니다.
                if(confirm("모든 일정에서 제외되었습니다. 장소를 영구 삭제하시겠습니까?")) {
                    onSpotDeleteRetry();
                    onClose();
                }
            }
        } catch (err) {
            console.error(err);
            alert("일정 제외 실패");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6">

                <div className="text-center mb-5">
                    <div className="text-3xl mb-2">⚠️</div>
                    <h2 className="text-xl font-bold text-gray-900">잠깐! 사용 중인 장소입니다.</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        아래 일정들에 포함되어 있어 장소를 삭제할 수 없습니다.<br/>
                        <strong>여기서 바로 제외하거나</strong>, 해당 계획으로 이동해 확인하세요.
                    </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 max-h-60 overflow-y-auto mb-6 border border-gray-100">
                    {conflicts.length === 0 ? (
                        <div className="text-center text-blue-600 font-bold py-4">
                            ✅ 모든 일정에서 제외되었습니다!
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {conflicts.map((item) => (
                                <li key={item.scheduleId} className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm gap-3">
                                    <div>
                                        <div className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                            {item.planName || "이름 없는 여행"}
                                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border">
                                                {item.planId ? '여행 계획' : '보관함'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {item.dayName} · {item.scheduleOrder}번째 순서
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <Link
                                            to={item.planId ? `/plans/${item.planId}` : `/days/${item.dayId}`}
                                            target="_blank"
                                            className="text-xs text-gray-500 hover:text-blue-600 font-bold px-2 py-1.5 transition"
                                        >
                                            확인 ↗
                                        </Link>
                                        <button
                                            onClick={() => handleRemoveSchedule(item.scheduleId)}
                                            className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-bold hover:bg-red-100 border border-red-100 transition"
                                        >
                                            이 일정에서 빼기
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition"
                    >
                        닫기
                    </button>
                    <button
                        onClick={() => {
                            onSpotDeleteRetry();
                            onClose();
                        }}
                        disabled={conflicts.length > 0}
                        className="flex-1 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        장소 삭제하기
                    </button>
                </div>
            </div>
        </div>
    );
}