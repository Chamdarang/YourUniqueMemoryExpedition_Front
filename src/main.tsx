import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import {RouterProvider} from 'react-router-dom';
import './style.css';
import {router} from "./router.tsx";
import { FeedbackProvider } from './components/common/FeedbackProvider';
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Suspense fallback={<div className="flex h-screen items-center justify-center font-bold text-blue-600">페이지를 불러오는 중...</div>}>
            <FeedbackProvider>
                <RouterProvider router={router} />
            </FeedbackProvider>
        </Suspense>
    </StrictMode>,
);
