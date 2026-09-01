import { useState } from "react";
import { toPng } from "html-to-image";
import type { ExportOptions } from "./scheduleExportUtils";
import { useFeedback } from './useFeedback';

export const useScheduleExport = () => {
    const { showToast } = useFeedback();
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportOptions, setExportOptions] = useState<ExportOptions>({
        header: true,
        map: true,
        schedule: true
    });

    const openExportModal = () => setIsExportModalOpen(true);
    const closeExportModal = () => setIsExportModalOpen(false);

    const handleSaveImage = async (filename: string, element: HTMLElement | null) => {
        if (!element) return;
        try {
            const images = Array.from(element.querySelectorAll("img"));
            await Promise.all(images.map(image => {
                if (image.complete && image.naturalWidth > 0) return Promise.resolve();
                return new Promise<void>(resolve => {
                    const done = () => resolve();
                    image.addEventListener("load", done, { once: true });
                    image.addEventListener("error", done, { once: true });
                });
            }));
            await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
            const dataUrl = await toPng(element, {
                backgroundColor: "#ffffff",
                cacheBust: false,
                pixelRatio: 2,
                skipFonts: true
            });
            const link = document.createElement("a");
            link.download = `${filename}.png`;
            link.href = dataUrl;
            link.click();
            closeExportModal();
            showToast({ message: '일정 이미지를 저장했습니다.', type: 'success' });
        } catch (error) {
            console.error(error);
            showToast({ message: "이미지를 저장하지 못했습니다.", type: 'error' });
        }
    };

    return {
        isExportModalOpen,
        openExportModal,
        closeExportModal,
        exportOptions,
        setExportOptions,
        handleSaveImage
    };
};
