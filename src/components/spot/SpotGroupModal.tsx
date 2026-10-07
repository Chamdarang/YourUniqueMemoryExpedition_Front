import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useState, useEffect } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentGroups: string[];
  onSave: (groups: string[]) => Promise<void>;
}

export default function SpotGroupModal({ isOpen, onClose, currentGroups, onSave }: Props) {
  const dialogRef = useDialogFocus(isOpen, onClose);
  // ----------------------------------------------------------------
  // 🧠 State
  // ----------------------------------------------------------------
  const [groups, setGroups] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

  // ----------------------------------------------------------------
  // ⚙️ Effects
  // ----------------------------------------------------------------

  // 모달이 열릴 때만 부모의 데이터를 복사해옴 (열려있는 동안 부모 데이터가 변해도 영향 X)
  useEffect(() => {
    if (isOpen) {
      setGroups([...currentGroups]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ----------------------------------------------------------------
  // 🎮 Handlers
  // ----------------------------------------------------------------

  // 태그 추가
  const addGroup = () => {
    const val = inputValue.trim();
    if (val && !groups.includes(val)) {
      setGroups([...groups, val]);
      setInputValue("");
    }
  };

  // 엔터키 입력 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addGroup();
    }
  };

  // 태그 삭제
  const removeGroup = (target: string) => {
    setGroups(groups.filter(g => g !== target));
  };

  // 저장
  const handleSave = async () => {
    await onSave(groups);
    onClose();
  };

  if (!isOpen) return null;

  return (
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="장소 그룹 편집" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6">

          <h2 className="text-xl font-bold mb-4 text-gray-800">🏷️ 그룹/태그 편집</h2>

          <div className="mb-4">
            {/* 입력창 & 추가 버튼 */}
            <div className="flex gap-2 mb-2">
              <input
                  autoFocus
                  type="text"
                  className="flex-1 p-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="태그 입력 후 엔터"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
              />
              <button
                  onClick={addGroup}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg font-bold transition"
              >
                +
              </button>
            </div>

            {/* 태그 목록 표시 영역 */}
            <div className="flex flex-wrap gap-2 min-h-[3rem] p-2 bg-gray-50 rounded-lg border border-gray-100 content-start">
              {groups.length === 0 && <span className="text-gray-400 text-sm p-1">태그가 없습니다.</span>}
              {groups.map(group => (
                  <span key={group} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-sm font-bold border border-blue-200">
                 #{group}
                    <button
                        onClick={() => removeGroup(group)}
                        className="ml-1 text-blue-400 hover:text-red-500 font-bold w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-50 transition"
                    >
                   ×
                 </button>
               </span>
              ))}
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="flex gap-3">
            <button
                onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-xl transition"
            >
              취소
            </button>
            <button
                onClick={handleSave}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-blue-200"
            >
              저장하기
            </button>
          </div>
        </div>
      </div>
  );
}