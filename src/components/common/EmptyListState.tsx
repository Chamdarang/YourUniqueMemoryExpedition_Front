import { Link } from 'react-router-dom';

export default function EmptyListState({ item, filtered = false, onReset, onCreate, createHref, createLabel }: {
  item: string; filtered?: boolean; onReset?: () => void; onCreate?: () => void; createHref?: string; createLabel?: string;
}) {
  const actionClass = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700';
  return <div role="status" className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-5 py-12 text-center">
    <p className="font-bold text-gray-800">{filtered ? `조건에 맞는 ${item}${item === '장소' ? '가' : '이'} 없습니다.` : `저장한 ${item}${item === '장소' ? '가' : '이'} 아직 없습니다.`}</p>
    <p className="mt-2 text-sm text-gray-600">{filtered ? '검색어나 필터를 바꿔서 다시 찾아보세요.' : '첫 기록을 추가해서 여행 준비를 시작해 보세요.'}</p>
    <div className="mt-5">
      {filtered && onReset ? <button type="button" onClick={onReset} className={actionClass}>검색 조건 초기화</button>
        : createHref ? <Link to={createHref} className={actionClass}>{createLabel}</Link>
        : onCreate ? <button type="button" onClick={onCreate} className={actionClass}>{createLabel}</button> : null}
    </div>
  </div>;
}
