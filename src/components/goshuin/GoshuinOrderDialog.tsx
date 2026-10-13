import { useCallback, useEffect, useState } from 'react';
import { getGoshuinBook, getGoshuinOrder, goshuinMessage, saveGoshuinOrder } from '../../api/goshuinApi';
import type { GoshuinBook, GoshuinEntry } from '../../types/goshuin';
import { useFeedback } from '../common/useFeedback';
import GoshuinPanel from './GoshuinPanel';
import { useGoshuinDraftGuard } from '../../hooks/useGoshuinDraftGuard';

export default function GoshuinOrderDialog({ book, onClose, onSaved }: { book: GoshuinBook; onClose: () => void; onSaved: () => void }) {
  const { confirm } = useFeedback();
  const [rows, setRows] = useState<GoshuinEntry[]>([]); const [baseline, setBaseline] = useState<number[]>([]);
  const [version, setVersion] = useState(book); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [drag, setDrag] = useState<number | null>(null);
  const [positions, setPositions] = useState<Record<number, string>>({});
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // Read the version before rows. Any intervening write will make saving conflict.
      const latest = await getGoshuinBook(book.id); const records = await getGoshuinOrder(book.id);
      setVersion(latest); setRows(records); setBaseline(records.map(e => e.id)); setPositions({});
    } catch (e) { setError(goshuinMessage(e)); } finally { setLoading(false); }
  }, [book.id]);
  useEffect(() => { void load(); }, [load]);
  const changed = JSON.stringify(rows.map(e => e.id)) !== JSON.stringify(baseline);
  const allowLeave = useGoshuinDraftGuard(changed, busy);
  const close = async () => { if (busy) return; if (changed && !await confirm({ title: '순서 편집', message: '변경한 순서를 버릴까요?', confirmLabel: '닫기' })) return; allowLeave(); onClose(); };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    setRows(current => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }); setPositions({});
  };
  const save = async () => {
    if (busy) return; setBusy(true); setError('');
    try { await saveGoshuinOrder(version, rows.map(e => e.id)); allowLeave(); onSaved(); }
    catch (e) { setError(goshuinMessage(e)); } finally { setBusy(false); }
  };
  return <GoshuinPanel title="고슈인 순서 편집" returnFocusId="goshuin-edit-order" busy={busy} onClose={() => void close()}>
    <p className="mb-4 text-sm text-gray-500">위·아래 버튼이나 원하는 순번으로 이동하세요. PC에서는 드래그도 가능합니다.</p>
    {loading && <p role="status">전체 순서를 불러오는 중…</p>}
    {!loading && <ol className="divide-y divide-gray-100">{rows.map((row, index) => <li key={row.id} draggable={!busy} onDragStart={event => { setDrag(index); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (drag !== null) move(drag, index); setDrag(null); }} onDragEnd={() => setDrag(null)}
      className="flex flex-wrap items-center gap-2 py-3">
      <span className="w-7 shrink-0 text-sm font-semibold text-gray-500">{index + 1}</span><span className="min-w-0 flex-1 break-words text-sm font-semibold">{row.itemName || row.placeName}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={busy || index === 0} aria-label={`${row.itemName || row.placeName} 위로`} className="yume-icon-button" onClick={() => move(index, index - 1)}>↑</button>
        <button type="button" disabled={busy || index === rows.length - 1} aria-label={`${row.itemName || row.placeName} 아래로`} className="yume-icon-button" onClick={() => move(index, index + 1)}>↓</button>
        <input type="number" disabled={busy} aria-label={`${row.itemName || row.placeName} 이동할 순번`} min={1} max={rows.length} value={positions[row.id] ?? String(index + 1)} className="yume-input w-16 px-2" onChange={event => setPositions(p => ({ ...p, [row.id]: event.target.value }))} />
        <button type="button" disabled={busy} className="yume-button yume-button-secondary px-2" onClick={() => { const n = Number(positions[row.id] ?? index + 1); if (Number.isInteger(n)) move(index, n - 1); }}>이동</button>
      </div>
    </li>)}</ol>}
    {error && <div role="alert" className="my-3 text-sm text-red-700">{error}<button type="button" disabled={busy || loading} className="ml-2 min-h-11 text-blue-700" onClick={() => void load()}>최신 순서 다시 불러오기</button></div>}
    <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} className="yume-button yume-button-secondary" onClick={() => void close()}>취소</button><button type="button" disabled={busy || loading || !changed} className="yume-button yume-button-primary" onClick={() => void save()}>{busy ? '저장 중…' : '순서 저장'}</button></div>
  </GoshuinPanel>;
}
