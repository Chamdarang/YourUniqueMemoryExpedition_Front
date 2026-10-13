import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getGoshuinBook, getGoshuinBooks, getGoshuinEntries, getGoshuinEntry, getGoshuinPurchaseSource, getGoshuinStats, goshuinMessage } from '../api/goshuinApi';
import type { GoshuinBook, GoshuinEntry, GoshuinPage } from '../types/goshuin';
import GoshuinBookForm, { GoshuinBookDelete } from '../components/goshuin/GoshuinBookForm';
import GoshuinEntryForm from '../components/goshuin/GoshuinEntryForm';
import GoshuinEntryDetail from '../components/goshuin/GoshuinEntryDetail';
import GoshuinOrderDialog from '../components/goshuin/GoshuinOrderDialog';
import GoshuinImportDialog from '../components/goshuin/GoshuinImportDialog';
import GoshuinPhoto from '../components/goshuin/GoshuinPhoto';
import { useFeedback } from '../components/common/useFeedback';
import RecordsPageLayout from '../components/common/RecordsPageLayout';

export default function GoshuinBooksPage() {
  const location = useLocation();
  const savedRecordId = location.state?.goshuinSavedId as number | undefined;
  const savedRecordPage = location.state?.goshuinSavedPage as number | undefined;
  const openSavedRecord = useRef<number | undefined>(savedRecordId);
  const navigate = useNavigate(); const { bookId: id } = useParams(); const [params] = useSearchParams();
  const bookId = id ? Number(id) : null; const unbound = !bookId && params.get('view') === 'unbound';
  const cacheKey = 'yume:goshuin-list:' + (localStorage.getItem('username') || '');
  const [cached] = useState<{ bookSearch?: string; keyword?: string; page?: number; scroll?: number }>(() => { try { const saved = JSON.parse(sessionStorage.getItem(cacheKey) || '{}'); return saved.bookId === bookId && saved.unbound === unbound ? saved : {}; } catch { return {}; } });
  const { showToast } = useFeedback();
  const [books, setBooks] = useState<GoshuinBook[]>([]); const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<GoshuinPage | null>(null); const [entryLoading, setEntryLoading] = useState(false); const [entryError, setEntryError] = useState('');
  const [bookSearch, setBookSearch] = useState(cached.bookSearch || ''); const [search, setSearch] = useState(cached.keyword || ''); const [keyword, setKeyword] = useState(cached.keyword || ''); const [page, setPage] = useState(cached.page || 0);
  const restoreScroll = useRef(true);
  useEffect(() => {
    const main = document.querySelector('main');
    const save = () => sessionStorage.setItem(cacheKey, JSON.stringify({ bookId, unbound, bookSearch, keyword, page, scroll: main?.scrollTop || 0 }));
    main?.addEventListener('scroll', save); save();
    return () => { main?.removeEventListener('scroll', save); save(); };
  }, [cacheKey, bookId, unbound, bookSearch, keyword, page]);
  const [bookForm, setBookForm] = useState<GoshuinBook | 'new' | null>(null); const [deleteBook, setDeleteBook] = useState<GoshuinBook | null>(null);
  const sourceId = Number(params.get('sourcePurchaseId')) || null;
  const [source, setSource] = useState<{ id: number; name: string | null } | null>(null);
  const [recordForm, setRecordForm] = useState<GoshuinEntry | 'new' | null>(null); const [detail, setDetail] = useState<GoshuinEntry | null>(null);
  const [orderBook, setOrderBook] = useState<GoshuinBook | null>(null); const [importBook, setImportBook] = useState<GoshuinBook | null>(null);
  const [actionError, setActionError] = useState(''); const [opening, setOpening] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const pending = opening || detailBusy;
  const editing = Boolean(bookForm || recordForm || orderBook || importBook || deleteBook);
  const openRequest = useRef(0);
  const previousView = useRef({ bookId, unbound });
  const selected = books.find(b => b.id === bookId);
  useEffect(() => {
    setBookForm(null); setRecordForm(null); setDetail(null); setOrderBook(null); setImportBook(null); setDeleteBook(null); setSource(null); setActionError('');
    openRequest.current += 1; setOpening(false);
    openSavedRecord.current = savedRecordId;
    if (previousView.current.bookId !== bookId || previousView.current.unbound !== unbound || savedRecordId != null) {
      setPage(savedRecordPage ?? 0); setSearch(''); setKeyword(''); setEntries(null);
      previousView.current = { bookId, unbound };
    }
  }, [bookId, unbound, sourceId, location.key, savedRecordId, savedRecordPage]);
  useEffect(() => {
    if (!sourceId) return;
    const controller = new AbortController();
    void getGoshuinPurchaseSource(sourceId, controller.signal).then(p => {
      if (p.bookId) navigate('/goshuin-books/' + p.bookId, { replace: true });
      else { setSource(p); setBookForm('new'); }
    }).catch(e => { if (!controller.signal.aborted) setActionError(goshuinMessage(e)); });
    return () => controller.abort();
  }, [sourceId, navigate]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void Promise.all([getGoshuinBooks(controller.signal), getGoshuinStats(controller.signal)]).then(([b, stats]) => { setBooks(b); setCount(stats.unboundCount); })
      .catch(e => { if (!controller.signal.aborted) setError(goshuinMessage(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!bookId && !unbound) return;
    const controller = new AbortController(); setEntryLoading(true); setEntryError('');
    void getGoshuinEntries({ bookId: bookId || undefined, unbound, keyword, page }, controller.signal).then(result => {
      if (result.totalPages && page >= result.totalPages) { setPage(result.totalPages - 1); return; }
      setEntries(result);
      if (openSavedRecord.current != null) {
        const saved = result.content.find(entry => entry.id === openSavedRecord.current);
        if (saved) { setDetail(saved); openSavedRecord.current = undefined; }
      }
      if (restoreScroll.current) { restoreScroll.current = false; requestAnimationFrame(() => { const main = document.querySelector('main'); if (main) main.scrollTop = cached.scroll || 0; }); }
    }).catch(e => { if (!controller.signal.aborted) setEntryError(goshuinMessage(e)); }).finally(() => { if (!controller.signal.aborted) setEntryLoading(false); });
    return () => controller.abort();
  }, [bookId, unbound, keyword, page, revision, cached]);
  const go = (path: string) => navigate(path);
  const refresh = () => setRevision(n => n + 1);
  const openEntry = async (entry: GoshuinEntry) => {
    if (pending) return;
    if (detail?.id === entry.id) { setDetail(null); return; }
    const request = ++openRequest.current; setOpening(true); setActionError('');
    try { const latest = await getGoshuinEntry(entry.id); if (request === openRequest.current) setDetail(latest); }
    catch (e) { if (request === openRequest.current) setActionError(goshuinMessage(e)); }
    finally { if (request === openRequest.current) setOpening(false); }
  };
  const editBook = async (book: GoshuinBook, deletion = false) => {
    if (pending) return; const request = ++openRequest.current; setOpening(true); setActionError('');
    try { const latest = await getGoshuinBook(book.id); if (request !== openRequest.current) return; setDetail(null); if (deletion) setDeleteBook(latest); else setBookForm(latest); }
    catch (e) { if (request === openRequest.current) setActionError(goshuinMessage(e)); }
    finally { if (request === openRequest.current) setOpening(false); }
  };
  const recordSaved = (saved: GoshuinEntry) => {
    setRecordForm(null); setDetail(saved.bookId === bookId ? saved : null); setSearch(''); setKeyword('');
    setPage(saved.bookId && saved.position ? Math.floor((saved.position - 1) / 20) : 0);
    if (saved.bookId !== bookId) navigate(saved.bookId ? '/goshuin-books/' + saved.bookId : '/goshuin-books?view=unbound', {
      state: { goshuinSavedId: saved.id, goshuinSavedPage: saved.bookId && saved.position ? Math.floor((saved.position - 1) / 20) : 0 },
    });
    refresh(); showToast({ message: '고슈인을 저장했습니다.', type: 'success' });
  };
  const bookList = <div className="space-y-3">
    <label htmlFor="goshuin-book-search" className="sr-only">첩 이름 검색</label>
    <input id="goshuin-book-search" type="search" className="yume-input w-full" placeholder="첩 이름 검색" value={bookSearch} onChange={e => setBookSearch(e.target.value)} />
    {books.filter(b => b.name.toLowerCase().includes(bookSearch.toLowerCase())).map(b => <button key={b.id} type="button" aria-current={selected?.id === b.id ? 'page' : undefined} onClick={() => go('/goshuin-books/' + b.id)}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${selected?.id === b.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
      {b.photoId && <GoshuinPhoto key={b.photoId} id={b.photoId} alt={b.name + ' 표지'} />}
      <span className="min-w-0 flex-1"><span className="block break-words text-sm font-bold text-gray-900">{b.name}</span><span className="mt-1 block text-xs text-gray-500">고슈인 {b.count}개</span></span>
    </button>)}
    {!loading && !error && !books.length && <div className="yume-card p-6 text-sm text-gray-500"><p>아직 등록한 고슈인첩이 없습니다.</p><button type="button" disabled={editing || pending} className="yume-button yume-button-primary mt-4" onClick={() => { setDetail(null); setBookForm('new'); }}>새 첩</button></div>}
    {!loading && books.length > 0 && !books.some(b => b.name.toLowerCase().includes(bookSearch.toLowerCase())) && <p className="text-sm text-gray-500">검색한 이름의 첩이 없습니다.</p>}
  </div>;
  return <RecordsPageLayout active="GOSHUIN"><div className="space-y-5">
    <header className={bookId ? 'hidden lg:block' : undefined}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-gray-900">내 고슈인첩</h2><button id="goshuin-add-book" type="button" disabled={editing || pending} className="yume-button yume-button-primary" onClick={() => { setDetail(null); setBookForm('new'); }}>새 첩</button></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1"><p className="text-sm text-gray-500">첩별로 받은 고슈인을 정리해 보세요.</p><Link to="/spots?mode=PURCHASE" state={{ restoreGoshuinLedger: true }} className="inline-flex min-h-11 items-center text-sm text-blue-600">기념품 장부 →</Link></div>
      <div className="yume-segmented mt-4 w-fit"><button type="button" className="yume-segment" aria-pressed={!unbound} onClick={() => go('/goshuin-books')}>내 고슈인첩</button><button type="button" className="yume-segment" aria-pressed={unbound} onClick={() => go('/goshuin-books?view=unbound')}>첩 없음 {count > 0 ? `(${count})` : ''}</button></div>
    </header>
    {loading && <p role="status" className="text-sm text-gray-500">고슈인첩을 불러오는 중…</p>}
    {error && <div role="alert" className="yume-card p-4 text-sm text-red-700">{error}<button type="button" className="ml-2 min-h-11 text-blue-700" onClick={refresh}>다시 불러오기</button></div>}
    {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
    {opening && <p role="status" className="text-sm text-gray-500">선택한 내용을 불러오는 중…</p>}
    <div className={unbound ? '' : 'grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]'}>
      {!unbound && <aside aria-label="고슈인첩 목록" className={bookId || bookForm ? 'hidden lg:block' : ''}>{bookList}</aside>}
      {bookForm && <GoshuinBookForm key={bookForm === 'new' ? 'new' : bookForm.id} book={bookForm === 'new' ? null : bookForm} books={books} initialSource={source} onClose={() => { setBookForm(null); setSource(null); if (sourceId) navigate('/goshuin-books', { replace: true }); refresh(); }} onSaved={b => { setBookForm(null); setSource(null); go('/goshuin-books/' + b.id); refresh(); showToast({ message: '고슈인첩을 저장했습니다.', type: 'success' }); }} />}
      {!bookForm && (bookId || unbound) && <section className="min-w-0 space-y-4" aria-label={unbound ? '첩 없는 고슈인' : '선택한 고슈인첩'}>
        {bookId && <button type="button" className="min-h-11 text-sm text-blue-700 lg:hidden" onClick={() => go('/goshuin-books')}>← 첩 목록</button>}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="break-words text-xl font-bold">{unbound ? '첩 없는 고슈인' : selected?.name || '고슈인첩'}</h2><p className="mt-1 text-sm text-gray-500">고슈인 {unbound ? count : selected?.count || 0}개</p>{selected?.memo && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-600">{selected.memo}</p>}</div>
          {selected && !editing && <details className="relative shrink-0"><summary id="goshuin-book-manage" aria-label="첩 관리" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-xl border border-gray-200">⋯</summary><div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-gray-200 bg-white p-2 shadow-sm"><button type="button" disabled={pending} className="block min-h-11 w-full text-left text-sm" onClick={() => { setDetail(null); void editBook(selected); }}>첩 수정</button><button type="button" disabled={pending} className="block min-h-11 w-full text-left text-sm text-red-700" onClick={() => void editBook(selected, true)}>첩 삭제</button></div></details>}
        </div>
        {deleteBook && <GoshuinBookDelete book={deleteBook} onClose={() => setDeleteBook(null)} onDeleted={(n, together) => { setDeleteBook(null); go('/goshuin-books'); refresh(); showToast({ message: together ? `첩과 고슈인 ${n}개를 삭제했습니다.` : `첩을 삭제했습니다. 고슈인 ${n}개는 첩 없이 보관했습니다.`, type: 'success' }); }} />}
        {!editing && <><div className="flex flex-wrap gap-2"><button id="goshuin-add-record" type="button" disabled={pending || Boolean(bookId && !selected)} className="yume-button yume-button-primary" onClick={() => { setDetail(null); setRecordForm('new'); }}>고슈인 추가</button>
          {selected && <><button id="goshuin-import-records" type="button" disabled={pending} className="yume-button yume-button-secondary" onClick={() => { setDetail(null); setImportBook(selected); }}>기존 기록 넣기</button><button id="goshuin-edit-order" type="button" disabled={pending || Boolean(keyword) || selected.count < 2} className="yume-button yume-button-secondary" title={keyword ? '검색을 지우고 전체 목록에서 편집하세요.' : undefined} onClick={() => { setDetail(null); setOrderBook(selected); }}>순서 편집</button></>}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setDetail(null); setPage(0); setKeyword(search.trim()); refresh(); }}>
          <label htmlFor="goshuin-record-search" className="sr-only">장소·고슈인 이름 검색</label><input id="goshuin-record-search" className="yume-input min-w-0 flex-1" type="search" placeholder="장소·고슈인 이름 검색" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} /><button className="yume-button yume-button-secondary">검색</button>
        </form></>}
        {recordForm && <GoshuinEntryForm key={recordForm === 'new' ? 'new' : recordForm.id} entry={recordForm === 'new' ? null : recordForm} books={books} initialBookId={bookId} onClose={current => { setRecordForm(null); setDetail(current?.bookId === bookId ? current : null); refresh(); }} onSaved={recordSaved} />}
        {orderBook && <GoshuinOrderDialog book={orderBook} onClose={() => setOrderBook(null)} onSaved={() => { setOrderBook(null); refresh(); showToast({ message: '순서를 저장했습니다.', type: 'success' }); }} />}
        {importBook && <GoshuinImportDialog book={importBook} onClose={() => { setImportBook(null); refresh(); }} onSaved={() => { setImportBook(null); refresh(); showToast({ message: '기존 고슈인을 첩에 넣었습니다.', type: 'success' }); }} />}
        {!editing && <>
        {keyword && <p className="text-sm text-gray-500">전체 {unbound ? count : selected?.count || 0}개 중 {entries?.totalElements || 0}개<button type="button" className="ml-3 min-h-11 text-blue-700" onClick={() => { setKeyword(''); setSearch(''); setPage(0); }}>검색 지우기</button></p>}
        {entryLoading && <p role="status" className="text-sm text-gray-500">고슈인을 불러오는 중…</p>}
        {entryError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{entryError}<button type="button" className="ml-2 min-h-11 text-blue-700" onClick={refresh}>다시 불러오기</button>{bookId && <button type="button" className="ml-2 min-h-11 text-blue-700" onClick={() => go('/goshuin-books')}>첩 목록으로</button>}</div>}
        {!entryError && entries && <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white" aria-busy={entryLoading}><ol className="divide-y divide-gray-100">
          {entries.content.map(entry => <li key={entry.id}><button id={`goshuin-record-${entry.id}`} type="button" aria-expanded={detail?.id === entry.id} aria-controls={detail?.id === entry.id ? `goshuin-detail-${entry.id}` : undefined} disabled={entryLoading || pending} className={`flex min-h-16 w-full items-center gap-3 p-4 text-left hover:bg-gray-50 ${detail?.id === entry.id ? 'bg-blue-50' : ''}`} onClick={() => void openEntry(entry)}>
            {entry.position != null && <span className="w-7 shrink-0 text-center text-sm font-semibold text-gray-500">{entry.position}</span>}
            <span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-sm font-semibold text-gray-900">{entry.itemName || entry.placeName}</span>
              {((entry.itemName && entry.itemName !== entry.placeName) || entry.acquiredDate) && <span className="mt-1 block text-xs text-gray-500">{[entry.itemName && entry.itemName !== entry.placeName ? entry.placeName : null, entry.acquiredDate].filter(Boolean).join(' · ')}</span>}
            </span>{entry.photoId && <GoshuinPhoto key={entry.photoId} id={entry.photoId} alt={entry.itemName || entry.placeName} />}
            <span aria-hidden="true" className="shrink-0 text-gray-400">{detail?.id === entry.id ? '⌃' : '⌄'}</span>
          </button>{detail?.id === entry.id && <div id={`goshuin-detail-${entry.id}`} className="p-3 pt-0 md:p-4 md:pt-0"><GoshuinEntryDetail key={detail.id + ':' + detail.version} entry={detail} onBusyChange={setDetailBusy} onClose={() => { setDetail(null); document.getElementById(`goshuin-record-${entry.id}`)?.focus({ preventScroll: true }); }} onEdit={e => { setDetail(null); setRecordForm(e); }} onChanged={() => { setDetail(null); refresh(); }} /></div>}</li>)}
        </ol>{!entries.content.length && !entryLoading && <p className="p-6 text-sm text-gray-500">{keyword ? '검색 결과가 없습니다.' : unbound ? '첩 없이 보관 중인 고슈인이 없습니다.' : '아직 이 첩에 등록한 고슈인이 없습니다.'}</p>}</div>}
        {entries && entries.totalPages > 1 && <nav aria-label="고슈인 페이지" className="flex items-center justify-center gap-3"><button type="button" disabled={entryLoading || page === 0} className="yume-button yume-button-secondary" onClick={() => { setDetail(null); setPage(p => p - 1); }}>이전</button><span className="text-sm text-gray-500">{page + 1} / {entries.totalPages}</span><button type="button" disabled={entryLoading || page + 1 >= entries.totalPages} className="yume-button yume-button-secondary" onClick={() => { setDetail(null); setPage(p => p + 1); }}>다음</button></nav>}
        </>}
      </section>}
      {!bookForm && !bookId && !unbound && <section className="hidden rounded-2xl border border-gray-100 bg-gray-50 p-8 text-sm text-gray-500 lg:block">첩을 선택하면 받은 고슈인을 순서대로 볼 수 있습니다.</section>}
    </div>
  </div></RecordsPageLayout>;
}
