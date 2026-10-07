interface Props {
    currentPage: number; // 0-based index
    totalPages: number;
    onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: Props) {
    if (totalPages <= 1) return null;

    // 페이지 번호 그룹 계산 (예: 1~5, 6~10...)
    const pageGroupSize = 5;
    const currentGroup = Math.floor(currentPage / pageGroupSize);
    const startPage = currentGroup * pageGroupSize;
    const endPage = Math.min(startPage + pageGroupSize, totalPages);

    return (
        <nav aria-label="페이지 이동" className="flex flex-wrap justify-center items-center gap-1 sm:gap-2 mt-8">
            <button
                type="button" aria-label="이전 페이지"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className="min-w-11 min-h-11 px-3 rounded border hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white"
            >
                &lt;
            </button>

            {Array.from({ length: endPage - startPage }, (_, i) => startPage + i).map((pageNum) => (
                <button
                    key={pageNum}
                    type="button" aria-label={`${pageNum + 1}페이지`} aria-current={currentPage === pageNum ? 'page' : undefined}
                    onClick={() => onPageChange(pageNum)}
                    className={`w-11 h-11 rounded-lg text-sm font-bold transition ${
                        currentPage === pageNum
                            ? "bg-gray-900 text-white"
                            : "text-gray-500 hover:bg-gray-100"
                    }`}
                >
                    {pageNum + 1}
                </button>
            ))}

            <button
                type="button" aria-label="다음 페이지"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages - 1}
                className="min-w-11 min-h-11 px-3 rounded border hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white"
            >
                &gt;
            </button>
        </nav>
    );
}
