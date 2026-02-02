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
        <div className="flex justify-center items-center gap-2 mt-8">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white"
            >
                &lt;
            </button>

            {Array.from({ length: endPage - startPage }, (_, i) => startPage + i).map((pageNum) => (
                <button
                    key={pageNum}
                    onClick={() => onPageChange(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition ${
                        currentPage === pageNum
                            ? "bg-gray-900 text-white"
                            : "text-gray-500 hover:bg-gray-100"
                    }`}
                >
                    {pageNum + 1}
                </button>
            ))}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages - 1}
                className="px-3 py-1 rounded border hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-white"
            >
                &gt;
            </button>
        </div>
    );
}