import { useEffect, useState } from 'react';
import { addSpotToGroup, createGroup, deleteGroup, getAllGroups, getGroupById, removeSpotFromGroup, updateGroup } from '../../api/groupApi';
import { getMySpots } from '../../api/spotApi';
import type { SpotGroupDetailResponse, SpotGroupResponse } from '../../types/groups';
import type { SpotResponse } from '../../types/spot';
import GoshuinDialog from '../goshuin/GoshuinDialog';
import { useFeedback } from '../common/useFeedback';

export default function SpotGroupManager({ onClose, onChanged, initialGroupId }: { onClose: () => void; onChanged: () => void; initialGroupId?: number }) {
  const { confirm } = useFeedback();
  const [groups, setGroups] = useState<SpotGroupResponse[]>([]);
  const [selected, setSelected] = useState(initialGroupId || 0);
  const [detail, setDetail] = useState<SpotGroupDetailResponse | null>(null);
  const [name, setName] = useState(''); const [newName, setNewName] = useState('');
  const [keyword, setKeyword] = useState(''); const [query, setQuery] = useState(''); const [page, setPage] = useState(0);
  const [spots, setSpots] = useState<SpotResponse[]>([]); const [pages, setPages] = useState(0);
  const [revision, setRevision] = useState(0); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let active = true; void getAllGroups().then(data => { if (active) setGroups(data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true; setLoading(true); setDetail(null);
    void getGroupById(selected).then(data => { if (active) { setDetail(data); setName(data.groupName); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true; setSpots([]);
    void getMySpots({ keyword: query, page, size: 20 }).then(data => { if (active) { setSpots(data.content); setPages(data.totalPages); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selected, query, page, revision]);
  const change = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); setRevision(n => n + 1); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : '그룹을 변경하지 못했습니다.'); } finally { setBusy(false); }
  };
  return <GoshuinDialog title="그룹 관리" onClose={() => { if (!busy) onClose(); }} wide>
    <div className="space-y-5">
      <p className="text-sm text-gray-500">그룹을 삭제하거나 장소를 제외해도 장소 기록은 남습니다.</p>
      {error && <div role="alert" className="text-sm text-red-700">{error}<button className="ml-2 min-h-11 text-blue-600" onClick={() => { setError(''); setRevision(n => n + 1); }}>다시 불러오기</button></div>}
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void change(async () => { const group = await createGroup({ groupName: newName.trim() }); setNewName(''); setSelected(group.id); }); }}>
        <input aria-label="새 그룹 이름" maxLength={100} className="yume-input min-w-0 flex-1" placeholder="새 그룹 이름" value={newName} onChange={e => setNewName(e.target.value)} disabled={busy} />
        <button className="yume-button yume-button-primary" disabled={busy || !newName.trim()}>그룹 만들기</button>
      </form>
      <select aria-label="관리할 그룹" className="yume-input w-full" value={selected} disabled={busy} onChange={e => { setSelected(Number(e.target.value)); setError(''); setPage(0); }}>
        <option value={0}>관리할 그룹 선택</option>{groups.map(g => <option key={g.id} value={g.id}>{g.groupName} ({g.spotCount})</option>)}
      </select>
      {loading && <p role="status">그룹을 불러오는 중…</p>}
      {selected > 0 && detail && <>
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void change(() => updateGroup(selected, { groupName: name.trim() })); }}>
          <input aria-label="그룹 이름" maxLength={100} className="yume-input min-w-0 flex-1" value={name} onChange={e => setName(e.target.value)} disabled={busy} />
          <button className="yume-button yume-button-secondary" disabled={busy || !name.trim()}>이름 변경</button>
          <button type="button" className="yume-button yume-button-danger-outline" disabled={busy} onClick={async () => { if (await confirm({ title: '그룹 삭제', message: `'${detail.groupName}' 그룹을 삭제할까요? 포함된 장소는 남습니다.`, confirmLabel: '그룹 삭제', danger: true })) void change(async () => { await deleteGroup(selected); setSelected(0); setDetail(null); }); }}>그룹 삭제</button>
        </form>
        <section aria-label="그룹에 포함된 장소"><h3 className="mb-2 text-sm font-bold">포함된 장소 {detail.spots.length}개</h3>
          {!detail.spots.length && <p className="text-sm text-gray-500">아직 포함된 장소가 없습니다.</p>}
          <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">{detail.spots.map(s => <li key={s.id} className="flex items-center justify-between gap-3 py-1"><span className="min-w-0 break-words text-sm">{s.spotName}</span><button disabled={busy} className="yume-button yume-button-secondary shrink-0" aria-label={s.spotName + ' 그룹에서 제외'} onClick={() => void change(() => removeSpotFromGroup(selected, s.id))}>제외</button></li>)}</ul>
        </section>
        <section aria-label="그룹에 장소 추가"><h3 className="mb-2 text-sm font-bold">장소 추가</h3>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(0); setQuery(keyword); }}><input aria-label="그룹에 추가할 장소 검색" className="yume-input min-w-0 flex-1" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="장소 이름 검색" /><button className="yume-button yume-button-secondary">검색</button></form>
          <ul className="mt-2 divide-y divide-gray-100">{spots.map(s => { const included = detail.spots.some(member => member.id === s.id); return <li key={s.id} className="flex items-center justify-between gap-3 py-1"><span className="min-w-0 break-words text-sm">{s.spotName}</span><button disabled={busy || included} className="yume-button yume-button-secondary shrink-0" aria-label={s.spotName + ' 그룹에 추가'} onClick={() => void change(() => addSpotToGroup(selected, s.id))}>{included ? '포함됨' : '추가'}</button></li>; })}</ul>
          {!spots.length && <p className="mt-3 text-sm text-gray-500">검색한 장소가 없습니다.</p>}
          {pages > 1 && <div className="mt-3 flex items-center justify-center gap-3"><button disabled={page === 0} className="yume-button yume-button-secondary" onClick={() => setPage(n => n - 1)}>이전</button><span className="text-sm">{page + 1} / {pages}</span><button disabled={page + 1 >= pages} className="yume-button yume-button-secondary" onClick={() => setPage(n => n + 1)}>다음</button></div>}
        </section>
      </>}
    </div>
  </GoshuinDialog>;
}
