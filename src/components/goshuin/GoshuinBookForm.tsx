import { useEffect, useState, type FormEvent } from 'react';
import { getAllPurchases } from '../../api/purchaseApi';
import { deleteGoshuinBook, getGoshuinBook, goshuinMessage, removeGoshuinPhoto, saveGoshuinBook, uploadGoshuinPhoto } from '../../api/goshuinApi';
import type { GoshuinBook } from '../../types/goshuin';
import type { SpotPurchaseResponse } from '../../types/purchase';
import { useFeedback } from '../common/useFeedback';
import GoshuinPanel from './GoshuinPanel';
import { useGoshuinDraftGuard } from '../../hooks/useGoshuinDraftGuard';
import GoshuinPhotoInput from './GoshuinPhotoInput';

export default function GoshuinBookForm({ book, books, initialSource, onClose, onSaved }: {
  book: GoshuinBook | null; books: GoshuinBook[]; onClose: () => void; onSaved: (book: GoshuinBook) => void;
  initialSource?: { id: number; name: string | null } | null;
}) {
  const { confirm } = useFeedback();
  const [current, setCurrent] = useState(book);
  const [name, setName] = useState(book?.name || initialSource?.name || ''); const [memo, setMemo] = useState(book?.memo || '');
  const [source, setSource] = useState<number | null>(initialSource?.id || null); const [sources, setSources] = useState<SpotPurchaseResponse[]>([]);
  const [page, setPage] = useState(-1); const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false); const [sourceError, setSourceError] = useState('');
  const [file, setFile] = useState<File | null>(null); const [remove, setRemove] = useState(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [photoFailure, setPhotoFailure] = useState(false);
  const [baseline, setBaseline] = useState(JSON.stringify({ name: book?.name || initialSource?.name || '', memo: book?.memo || '', source: initialSource?.id || null }));
  const allowLeave = useGoshuinDraftGuard(JSON.stringify({ name, memo, source }) !== baseline || Boolean(file || remove), saving);
  const finish = (saved: GoshuinBook) => { allowLeave(); onSaved(saved); };
  const close = async () => {
    if (saving) return;
    if ((JSON.stringify({ name, memo, source }) !== baseline || file || remove) && !await confirm({ title: '입력 내용', message: '입력한 내용을 버릴까요?', confirmLabel: '닫기' })) return;
    allowLeave(); onClose();
  };
  const loadSources = async () => {
    setLoading(true); setSourceError('');
    try {
      const result = await getAllPurchases({ page: page + 1, size: 20, kind: 'GOSHUINCHO', status: 'ACQUIRED' });
      setSources(s => [...s, ...result.content.filter(p => !books.some(b => b.sourcePurchaseId === p.id))]); setPage(result.number); setPages(result.totalPages);
    } catch (e) { setSourceError(goshuinMessage(e)); } finally { setLoading(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError('');
    try {
      const saved = await saveGoshuinBook(current?.id || null, { name, memo: memo || null, sourcePurchaseId: source, version: current?.version });
      setCurrent(saved); setBaseline(JSON.stringify({ name, memo, source }));
      try {
        if (file) await uploadGoshuinPhoto('books', saved.id, saved.version, file);
        else if (remove && saved.photoId) await removeGoshuinPhoto('books', saved.id, saved.version);
      } catch (e) { setPhotoFailure(true); setError('첩은 저장됐지만 사진 처리를 완료하지 못했습니다. ' + goshuinMessage(e)); return; }
      setFile(null); setRemove(false); finish(await getGoshuinBook(saved.id));
    } catch (e) { setError(goshuinMessage(e)); } finally { setSaving(false); }
  };
  return <GoshuinPanel title={book ? '첩 수정' : '새 고슈인첩'} returnFocusId={book ? 'goshuin-book-manage' : 'goshuin-add-book'} busy={saving} onClose={() => void close()}>
    <form className="space-y-5" onSubmit={e => void save(e)}>
      <fieldset disabled={saving} className="space-y-5">
        <div><label htmlFor="goshuin-book-name" className="mb-1 block text-sm font-semibold">첩 이름 (필수)</label><input data-dialog-initial-focus id="goshuin-book-name" required maxLength={80} className="yume-input w-full" value={name} onChange={e => setName(e.target.value)} placeholder="예: 교토 여행첩" /></div>
        <div><label htmlFor="goshuin-book-memo" className="mb-1 block text-sm font-semibold">메모 (선택)</label><textarea id="goshuin-book-memo" maxLength={2000} rows={3} className="yume-input w-full" value={memo} onChange={e => setMemo(e.target.value)} /></div>
        <details open={photoFailure || undefined}><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-blue-700">표지 사진 추가·수정</summary><GoshuinPhotoInput photoId={current?.photoId || null} file={file} remove={remove} onFile={setFile} onRemove={setRemove} /></details>
        {!current && <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-blue-700">기존 고슈인첩 구매 기록에서 만들기</summary>
          {initialSource && source === initialSource.id && <p className="mb-2 text-sm">연결할 구매 기록: {initialSource.name || '고슈인첩'}</p>}
          <p className="mb-2 text-xs text-gray-500">구매 정보는 그대로 두고 첩 관리에 연결합니다.</p>
          {sources.map(s => <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="book-source" checked={source === s.id} onChange={() => { setSource(s.id); setName(s.itemName || s.spotName || '고슈인첩'); }} />{s.itemName || s.spotName}</label>)}
          {source && <button type="button" className="yume-button yume-button-secondary" onClick={() => setSource(null)}>구매 연결 해제</button>}
          {(page < 0 || page + 1 < pages || sourceError) && <button type="button" className="yume-button yume-button-secondary" disabled={loading} onClick={() => void loadSources()}>{loading ? '불러오는 중…' : '구매 기록 불러오기'}</button>}
          {sourceError && <p role="alert" className="text-sm text-red-700">{sourceError}</p>}
          {page >= 0 && !loading && !sourceError && !sources.length && <p className="text-sm text-gray-500">연결할 받은 고슈인첩 구매 기록이 없습니다.</p>}
        </details>}
      </fieldset>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {photoFailure && current && <button type="button" className="yume-button yume-button-secondary" disabled={saving} onClick={() => finish(current)}>사진 없이 마치기</button>}
        <button type="button" className="yume-button yume-button-secondary" disabled={saving} onClick={() => void close()}>취소</button>
        <button className="yume-button yume-button-primary" disabled={saving}>{saving ? '저장 중…' : photoFailure ? '사진 다시 처리' : '저장'}</button>
      </div>
    </form>
  </GoshuinPanel>;
}

export function GoshuinBookDelete({ book, onClose, onDeleted }: { book: GoshuinBook; onClose: () => void; onDeleted: (count: number, together: boolean) => void }) {
  const [latest, setLatest] = useState<GoshuinBook | null>(null); const [together, setTogether] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let active = true; void getGoshuinBook(book.id).then(b => { if (active) setLatest(b); }).catch(e => { if (active) setError(goshuinMessage(e)); }); return () => { active = false; }; }, [book.id]);
  const removeBook = async () => {
    if (!latest || busy) return; setBusy(true); setError('');
    try {
      const now = await getGoshuinBook(latest.id);
      if (now.version !== latest.version) { setLatest(now); setTogether(false); setError('첩 내용이 변경됐습니다. 새 개수를 확인하고 다시 삭제해 주세요.'); return; }
      await deleteGoshuinBook(latest, together); onDeleted(latest.count, together);
    } catch (e) { setError(goshuinMessage(e)); } finally { setBusy(false); }
  };
  return <GoshuinPanel title="고슈인첩 삭제" returnFocusId="goshuin-book-manage" busy={busy} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-4">
      <p className="font-semibold break-words">‘{book.name}’을 삭제할까요?</p>
      {!latest && !error && <p role="status">등록 개수를 확인하는 중…</p>}
      {latest && <><p className="text-sm text-gray-600">등록된 고슈인 {latest.count}개가 있습니다.</p>
        {latest.count > 0 && <label className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm"><input type="checkbox" disabled={busy} checked={together} onChange={e => setTogether(e.target.checked)} />등록된 고슈인도 함께 삭제</label>}
        <p className={together ? 'text-sm text-red-700' : 'text-sm text-gray-600'}>{together ? `이 첩의 고슈인 ${latest.count}개와 사진도 함께 삭제됩니다. 기념품 장부에서도 사라집니다.` : `고슈인 ${latest.count}개는 남겨두고 ‘첩 없음’으로 보관합니다.`}</p>
        {latest.sourcePurchaseId && <p className="text-xs text-gray-500">연결된 고슈인첩 구매 기록은 남습니다.</p>}</>}
      {error && <div role="alert" className="text-sm text-red-700">{error}<button type="button" className="ml-2 min-h-11 text-blue-700" onClick={() => { void getGoshuinBook(book.id).then(b => { setLatest(b); setError(''); setTogether(false); }).catch(e => setError(goshuinMessage(e))); }}>다시 확인</button></div>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} className="yume-button yume-button-secondary" onClick={onClose}>취소</button><button type="button" disabled={busy || !latest} className="yume-button bg-red-600 text-white hover:bg-red-700" onClick={() => void removeBook()}>{busy ? '삭제 중…' : together ? '첩과 고슈인 삭제' : '첩 삭제'}</button></div>
    </div>
  </GoshuinPanel>;
}
