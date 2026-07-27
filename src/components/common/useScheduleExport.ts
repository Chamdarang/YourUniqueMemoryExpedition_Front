import { useState } from "react";
import { toPng } from "html-to-image";
import type { ExportOptions } from "./scheduleExportUtils";

export const useScheduleExport = () => {
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
        } catch (error) {
            console.error(error);
            alert("이미지 저장 중 오류가 발생했습니다.");
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
