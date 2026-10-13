import { useEffect, useState } from 'react';
import { getGoshuinBook, getGoshuinEntries, goshuinMessage, importGoshuinEntries } from '../../api/goshuinApi';
import type { GoshuinBook, GoshuinEntry } from '../../types/goshuin';
import { useFeedback } from '../common/useFeedback';
import GoshuinPanel from './GoshuinPanel';
import { useGoshuinDraftGuard } from '../../hooks/useGoshuinDraftGuard';

export default function GoshuinImportDialog({ book, onClose, onSaved }: { book: GoshuinBook; onClose: () => void; onSaved: () => void }) {
  const { confirm } = useFeedback();
  const [other, setOther] = useState(false); const [search, setSearch] = useState(''); const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<GoshuinEntry[]>([]); const [selected, setSelected] = useState<GoshuinEntry[]>([]);
  const [page, setPage] = useState(0); const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const allowLeave = useGoshuinDraftGuard(selected.length > 0, busy);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void getGoshuinEntries({ unbound: !other, keyword, page }, controller.signal).then(result => {
      setRows(previous => page ? [...previous, ...result.content] : result.content); setPages(result.totalPages);
    }).catch(e => { if (!controller.signal.aborted) setError(goshuinMessage(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [other, keyword, page, retry]);
  const close = async () => { if (busy) return; if (selected.length && !await confirm({ title: '기록 선택', message: '선택을 취소하고 닫을까요?', confirmLabel: '닫기' })) return; allowLeave(); onClose(); };
  const save = async () => {
    if (busy || !selected.length) return;
    const moving = selected.filter(e => e.bookId);
    if (moving.length && !await confirm({ title: '다른 첩에서 이동', message: moving.map(e => `${e.itemName || e.placeName}: ${e.bookName} → ${book.name}`).join('\n'), confirmLabel: '이동하여 넣기' })) return;
    setBusy(true); setError('');
    try {
      await importGoshuinEntries(book, selected); allowLeave(); onSaved();
    } catch (e) { setError(goshuinMessage(e)); } finally { setBusy(false); }
  };
  return <GoshuinPanel title="기존 고슈인 넣기" returnFocusId="goshuin-import-records" busy={busy} onClose={() => void close()}>
    <div className="space-y-4">
      <p className="text-sm text-gray-500">받은 고슈인을 선택한 순서대로 첩 맨 뒤에 넣습니다. 기존 기록을 복사하지 않습니다.</p>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={busy || loading} checked={other} onChange={e => { setOther(e.target.checked); setPage(0); setRows([]); }} />다른 첩에 있는 기록도 보기</label>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(0); setKeyword(search.trim()); setRetry(n => n + 1); }}>
        <input aria-label="기존 고슈인 장소·이름 검색" className="yume-input min-w-0 flex-1" value={search} maxLength={120} onChange={e => setSearch(e.target.value)} /><button disabled={busy} className="yume-button yume-button-secondary">검색</button>
      </form>
      <div className="divide-y divide-gray-100">{rows.filter(e => e.bookId !== book.id).map(e => <label key={e.id} className="flex min-h-14 items-center gap-3 py-3">
        <input type="checkbox" disabled={busy || (selected.length >= 200 && !selected.some(s => s.id === e.id))} checked={selected.some(s => s.id === e.id)} onChange={event => setSelected(s => event.target.checked ? [...s, e] : s.filter(x => x.id !== e.id))} />
        <span className="min-w-0"><span className="block break-words text-sm font-semibold">{e.itemName || e.placeName}</span><span className="block text-xs text-gray-500">{e.bookName ? `${e.bookName}에서 이동` : '첩 없음'}{e.acquiredDate ? ' · ' + e.acquiredDate : ''}</span></span>
      </label>)}</div>
      {loading && <p role="status" className="text-sm text-gray-500">기록을 불러오는 중…</p>}
      {!loading && !error && !rows.filter(e => e.bookId !== book.id).length && <p className="text-sm text-gray-500">선택할 받은 고슈인이 없습니다.</p>}
      {error && <div role="alert" className="text-sm text-red-700">{error}<button type="button" className="ml-2 min-h-11 text-blue-700" disabled={busy} onClick={() => { setPage(0); setRetry(n => n + 1); }}>다시 불러오기</button></div>}
      {page + 1 < pages && <button type="button" disabled={loading || busy} className="yume-button yume-button-secondary" onClick={() => setPage(p => p + 1)}>더 불러오기</button>}
      {selected.length > 0 && <div className="rounded-xl bg-blue-50 p-3 text-sm"><p className="mb-2 font-semibold">추가 순서 · {selected.length}개</p><ol className="list-inside list-decimal">{selected.map(e => <li key={e.id} className="break-words">{e.itemName || e.placeName}</li>)}</ol></div>}
      <div className="flex justify-end gap-2"><button type="button" className="yume-button yume-button-secondary" disabled={busy} onClick={() => void close()}>취소</button><button type="button" className="yume-button yume-button-primary" disabled={busy || loading || !selected.length} onClick={() => void save()}>{busy ? '넣는 중…' : `${selected.length}개 넣기`}</button></div>
      {error && <button type="button" className="min-h-11 text-sm text-blue-700" disabled={busy} onClick={() => { void getGoshuinBook(book.id).then(() => close()).catch(e => setError(goshuinMessage(e))); }}>닫고 첩 목록 다시 확인</button>}
    </div>
  </GoshuinPanel>;
}
