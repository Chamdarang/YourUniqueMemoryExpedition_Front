import { Link } from 'react-router-dom';

interface Props {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  backTo?: string;
}

export default function LoadErrorState({ message, onRetry, retrying = false, backTo }: Props) {
  return (
    <div role="alert" className="yume-card yume-card-error my-4 p-5 text-sm">
      <p className="font-semibold">{message}</p>
      <p className="mt-1 text-red-700">연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={retrying} onClick={onRetry} className="yume-button yume-button-secondary px-4">
          {retrying ? '다시 불러오는 중…' : '다시 시도'}
        </button>
        {backTo && <Link to={backTo} className="yume-button yume-button-secondary px-3">목록으로</Link>}
      </div>
    </div>
  );
}
