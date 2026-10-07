import { Link } from 'react-router-dom';

interface Props {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  backTo?: string;
}

export default function LoadErrorState({ message, onRetry, retrying = false, backTo }: Props) {
  return (
    <div role="alert" className="my-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
      <p className="font-semibold">{message}</p>
      <p className="mt-1 text-red-700">연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={retrying} onClick={onRetry} className="min-h-11 rounded-lg bg-white px-4 font-semibold shadow-sm disabled:opacity-50">
          {retrying ? '다시 불러오는 중…' : '다시 시도'}
        </button>
        {backTo && <Link to={backTo} className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold underline">목록으로</Link>}
      </div>
    </div>
  );
}
