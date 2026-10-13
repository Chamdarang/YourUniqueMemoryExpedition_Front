import { useEffect, useState } from 'react';
import { deleteGoshuinEntry, getGoshuinEntry, goshuinMessage, saveGoshuinEntry } from '../../api/goshuinApi';
import type { GoshuinEntry } from '../../types/goshuin';
import { useFeedback } from '../common/useFeedback';
import GoshuinPanel from './GoshuinPanel';
import GoshuinPhoto from './GoshuinPhoto';
import { useGoshuinDraftGuard } from '../../hooks/useGoshuinDraftGuard';

export default function GoshuinEntryDetail({ entry, onClose, onEdit, onChanged, onBusyChange }: {
  entry: GoshuinEntry; onClose: () => void; onEdit: (entry: GoshuinEntry) => void; onChanged: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { confirm } = useFeedback();
  const [current, setCurrent] = useState(entry); const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const allowLeave = useGoshuinDraftGuard(false, busy);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const remove = async (deleteRecord: boolean) => {
    if (busy) return;
    if (!await confirm({ title: deleteRecord ? '고슈인 삭제' : '첩에서 빼기', message: deleteRecord ? '이 고슈인과 사진을 삭제할까요? 기념품 장부에서도 사라집니다.' : '첩에서 빼고 ‘첩 없음’으로 보관할까요? 날짜·사진·메모는 남습니다.', confirmLabel: deleteRecord ? '고슈인 삭제' : '첩에서 빼기', danger: deleteRecord })) return;
    setBusy(true); setError('');
    try {
      if (deleteRecord) await deleteGoshuinEntry(current);
      else await saveGoshuinEntry(current.id, { ...current, bookId: null, position: null });
      allowLeave(); onChanged();
    } catch (e) { setError(goshuinMessage(e)); } finally { setBusy(false); }
  };
  return <GoshuinPanel title={current.itemName || current.placeName} busy={busy} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-5">
      <dl className="space-y-3 text-sm">
        <div><dt className="text-gray-500">받은 장소</dt><dd className="mt-1 break-words font-semibold">{current.placeName}</dd></div>
        <div><dt className="text-gray-500">고슈인첩</dt><dd className="mt-1">{current.bookName ? `${current.bookName} · ${current.position}번째` : '첩 없음 · 별개로 보관'}</dd></div>
        <div><dt className="text-gray-500">받은 날짜</dt><dd className="mt-1">{current.acquiredDate || '미입력'}</dd></div>
        {current.note && <div><dt className="text-gray-500">메모</dt><dd className="mt-1 whitespace-pre-wrap break-words">{current.note}</dd></div>}
        {current.quantity > 1 && <div><dt className="text-gray-500">기존 장부 수량</dt><dd>{current.quantity}개 · 첩에서는 한 기록으로 관리합니다.</dd></div>}
      </dl>
      {current.photoId && <div>{expanded ? <GoshuinPhoto key={current.photoId + 'original'} id={current.photoId} large alt={current.itemName || current.placeName} /> : <button type="button" className="flex min-h-11 items-center gap-3 text-sm text-blue-700" onClick={() => setExpanded(true)}><GoshuinPhoto key={current.photoId} id={current.photoId} alt={current.itemName || current.placeName} />사진 크게 보기</button>}</div>}
      {error && <div role="alert" className="text-sm text-red-700">{error}<button type="button" disabled={busy} className="ml-2 min-h-11 text-blue-700" onClick={() => { void getGoshuinEntry(current.id).then(e => { setCurrent(e); setError(''); }).catch(e => setError(goshuinMessage(e))); }}>최신 기록 불러오기</button></div>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="yume-button yume-button-primary" onClick={() => onEdit(current)}>수정·다른 첩으로 이동</button>
        {current.bookId && <button type="button" disabled={busy} className="yume-button yume-button-secondary" onClick={() => void remove(false)}>첩에서 빼기</button>}
        <button type="button" disabled={busy} className="yume-button yume-button-danger-outline" onClick={() => void remove(true)}>고슈인 삭제</button>
      </div>
    </div>
  </GoshuinPanel>;
}
