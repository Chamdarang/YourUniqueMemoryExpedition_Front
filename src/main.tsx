import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {RouterProvider} from 'react-router-dom';
import './style.css';
import {router} from "./router.tsx";

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {/* ✅ BrowserRouter 대신 RouterProvider 사용 */}
        <RouterProvider router={router} />
    </StrictMode>,
);