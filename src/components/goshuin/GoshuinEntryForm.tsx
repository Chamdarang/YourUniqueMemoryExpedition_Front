import { useState, type FormEvent } from 'react';
import { getGoshuinEntry, goshuinMessage, removeGoshuinPhoto, saveGoshuinEntry, uploadGoshuinPhoto } from '../../api/goshuinApi';
import { getMySpots } from '../../api/spotApi';
import { getSpotDisplayName } from '../../utils/spotUtils';
import type { GoshuinBook, GoshuinEntry, GoshuinInput } from '../../types/goshuin';
import type { SpotResponse } from '../../types/spot';
import { useFeedback } from '../common/useFeedback';
import GoshuinPanel from './GoshuinPanel';
import { useGoshuinDraftGuard } from '../../hooks/useGoshuinDraftGuard';
import GoshuinPhotoInput from './GoshuinPhotoInput';

export default function GoshuinEntryForm({ entry, books, initialBookId, onClose, onSaved }: {
  entry: GoshuinEntry | null; books: GoshuinBook[]; initialBookId: number | null;
  onClose: (current: GoshuinEntry | null) => void; onSaved: (entry: GoshuinEntry) => void;
}) {
  const { confirm } = useFeedback();
  const initial: GoshuinInput = {
    placeName: entry?.placeName || '', spotUserId: entry?.spotUserId || null, itemName: entry?.itemName || null,
    acquiredDate: entry?.acquiredDate || null, note: entry?.note || null,
    bookId: entry ? entry.bookId : initialBookId, position: null, version: entry?.version,
  };
  const [form, setForm] = useState(initial); const [current, setCurrent] = useState(entry);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null); const [remove, setRemove] = useState(false);
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [photoFailure, setPhotoFailure] = useState(false);
  const [spotKeyword, setSpotKeyword] = useState(''); const [spots, setSpots] = useState<SpotResponse[]>([]);
  const [spotPage, setSpotPage] = useState(0); const [spotPages, setSpotPages] = useState(0); const [spotLoading, setSpotLoading] = useState(false); const [spotError, setSpotError] = useState('');
  const dirty = JSON.stringify(form) !== (savedSnapshot || JSON.stringify(initial)) || Boolean(file || remove);
  const allowLeave = useGoshuinDraftGuard(dirty, saving);
  const finish = (saved: GoshuinEntry) => { allowLeave(); onSaved(saved); };
  const field = <K extends keyof GoshuinInput>(key: K, value: GoshuinInput[K]) => setForm(f => ({ ...f, [key]: value }));
  const close = async () => {
    if (saving) return;
    const baseline = savedSnapshot || JSON.stringify(initial);
    if ((JSON.stringify(form) !== baseline || file || remove) && !await confirm({ title: '입력 내용', message: '입력한 내용을 버릴까요?', confirmLabel: '닫기' })) return;
    allowLeave(); onClose(current);
  };
  const findSpots = async (more = false) => {
    setSpotLoading(true); setSpotError('');
    try {
      const page = more ? spotPage + 1 : 0;
      const result = await getMySpots({ keyword: spotKeyword.trim(), page, size: 20 });
      setSpots(previous => more ? [...previous, ...result.content] : result.content); setSpotPage(page); setSpotPages(result.totalPages);
    } catch (e) { setSpotError(goshuinMessage(e)); } finally { setSpotLoading(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(''); let saved: GoshuinEntry | null = null;
    try {
      const snapshot = JSON.stringify(form);
      saved = current && savedSnapshot === snapshot ? current : await saveGoshuinEntry(current?.id || null, form);
      setCurrent(saved);
      const nextForm = { ...form, version: saved.version, position: null };
      setForm(nextForm); setSavedSnapshot(JSON.stringify(nextForm));
      try {
        if (file) await uploadGoshuinPhoto('records', saved.id, saved.version, file);
        else if (remove && saved.photoId) await removeGoshuinPhoto('records', saved.id, saved.version);
      } catch (e) {
        setPhotoFailure(true); setError('기록은 저장됐지만 사진 처리를 완료하지 못했습니다. ' + goshuinMessage(e)); return;
      }
      setFile(null); setRemove(false); setPhotoFailure(false);
      finish(await getGoshuinEntry(saved.id));
    } catch (e) { setError(goshuinMessage(e)); }
    finally { setSaving(false); }
  };
  const selected = books.find(b => b.id === form.bookId);
  const targetCount = selected ? selected.count - (current?.bookId === selected.id ? 1 : 0) : 0;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return <GoshuinPanel title={entry ? '고슈인 수정·이동' : '고슈인 추가'} returnFocusId="goshuin-add-record" busy={saving} onClose={() => void close()}>
    <form onSubmit={e => void submit(e)} className="space-y-5">
      <fieldset disabled={saving} className="space-y-5 disabled:opacity-60">
        <div><label htmlFor="goshuin-place" className="mb-1 block text-sm font-semibold">받은 장소 (필수)</label>
          <input id="goshuin-place" data-dialog-initial-focus required maxLength={120} value={form.placeName} onChange={e => setForm(f => ({ ...f, placeName: e.target.value, spotUserId: null }))} className="yume-input w-full" placeholder="신사·사찰 이름을 직접 입력" />
          <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm text-blue-700">내 장소에서 선택</summary>
            <div className="space-y-2 rounded-xl bg-gray-50 p-3">
              <label htmlFor="goshuin-spot-search" className="text-xs font-semibold">보관함 장소 검색</label>
              <div className="flex gap-2"><input id="goshuin-spot-search" value={spotKeyword} onChange={e => setSpotKeyword(e.target.value)} className="yume-input min-w-0 flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void findSpots(); } }} /><button type="button" className="yume-button yume-button-secondary" disabled={spotLoading} onClick={() => void findSpots()}>검색</button></div>
              {spotLoading && <p role="status" className="text-sm">장소 검색 중…</p>}
              {spotError && <p role="alert" className="text-sm text-red-700">{spotError}</p>}
              {spots.map(s => <button type="button" key={s.id} className="block min-h-11 w-full rounded-lg px-2 text-left text-sm hover:bg-white" onClick={() => setForm(f => ({ ...f, spotUserId: s.id, placeName: getSpotDisplayName(s) }))}>{getSpotDisplayName(s)}</button>)}
              {spotPage + 1 < spotPages && <button type="button" disabled={spotLoading} className="yume-button yume-button-secondary" onClick={() => void findSpots(true)}>장소 더 불러오기</button>}
            </div>
          </details>
        </div>
        <div><label htmlFor="goshuin-book" className="mb-1 block text-sm font-semibold">고슈인첩</label>
          <select id="goshuin-book" value={form.bookId || ''} onChange={e => setForm(f => ({ ...f, bookId: Number(e.target.value) || null, position: null }))} className="yume-input w-full">
            <option value="">첩 없음 · 별개로 보관</option>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {form.bookId && <><p className="mt-2 text-xs text-gray-500">{current?.bookId === form.bookId && form.position === null ? `현재 ${current.position}번째 · 순서 유지` : `${form.position || targetCount + 1}번째에 넣습니다`}</p>
            <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-blue-700">넣을 위치 변경</summary>
              <label htmlFor="goshuin-position" className="text-sm">순서 (1~{targetCount + 1})</label><input id="goshuin-position" type="number" min={1} max={targetCount + 1} value={form.position || ''} placeholder="맨 뒤" onChange={e => field('position', e.target.value ? Number(e.target.value) : null)} className="yume-input mt-1 w-full" />
            </details></>}
        </div>
        <div><label htmlFor="goshuin-date" className="mb-1 block text-sm font-semibold">받은 날짜 (선택)</label>
          <input id="goshuin-date" type="date" max={current?.acquiredDate && current.acquiredDate > today ? current.acquiredDate : today} value={form.acquiredDate || ''} onChange={e => field('acquiredDate', e.target.value || null)} className="yume-input w-full" />
        </div>
        <details open={photoFailure || undefined}><summary className="min-h-11 cursor-pointer py-3 font-semibold text-blue-700">더 기록하기</summary>
          <div className="space-y-4 pt-2">
            <div><label htmlFor="goshuin-name" className="mb-1 block text-sm font-semibold">고슈인 이름 (선택)</label><input id="goshuin-name" maxLength={120} value={form.itemName || ''} onChange={e => field('itemName', e.target.value || null)} className="yume-input w-full" placeholder="예: 가을 한정 고슈인" /></div>
            <GoshuinPhotoInput photoId={current?.photoId || null} file={file} remove={remove} onFile={setFile} onRemove={setRemove} />
            <div><label htmlFor="goshuin-note" className="mb-1 block text-sm font-semibold">메모 (선택)</label><textarea id="goshuin-note" maxLength={2000} rows={3} value={form.note || ''} onChange={e => field('note', e.target.value || null)} className="yume-input w-full" /></div>
          </div>
        </details>
      </fieldset>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {photoFailure && current && <button type="button" disabled={saving} className="yume-button yume-button-secondary" onClick={() => finish(current)}>사진 없이 마치기</button>}
        <button type="button" disabled={saving} onClick={() => void close()} className="yume-button yume-button-secondary">취소</button>
        <button disabled={saving} className="yume-button yume-button-primary">{saving ? '저장 중…' : photoFailure ? '사진 다시 처리' : '저장'}</button>
      </div>
    </form>
  </GoshuinPanel>;
}
