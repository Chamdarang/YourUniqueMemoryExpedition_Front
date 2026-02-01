// src/router.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";

// Pages
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ExplorePage from "./pages/ExplorePage";

import PlanListPage from "./pages/PlanListPage";
import PlanCreatePage from "./pages/PlanCreatePage";
import PlanDetailPage from "./pages/PlanDetailPage";

import DayListPage from "./pages/DayListPage";
import DayDetailPage from "./pages/DayDetailPage";

import SpotListPage from "./pages/SpotListPage";
import SpotDetailPage from "./pages/SpotDetailPage";

// Components
import Layout from "./components/common/Layout";
import {PrivateRoute, PublicRoute} from "./components/auth/RouteGuard.tsx";

export const router = createBrowserRouter([
    {
        // 1. 로그인 (비로그인 사용자용)
        path: "/login",
        element: (
            <PublicRoute>
                <LoginPage />
            </PublicRoute>
        ),
    },
    {
        // 2. 보호된 라우트 (Layout 적용 + PrivateRoute)
        element: (
            <PrivateRoute>
                <Layout />
            </PrivateRoute>
        ),
        children: [
            { path: "/", element: <HomePage /> },

            // 탐색
            { path: "/map", element: <ExplorePage /> },

            // 여행 계획
            { path: "/plans", element: <PlanListPage /> },
            { path: "/plans/create", element: <PlanCreatePage /> },
            { path: "/plans/:id", element: <PlanDetailPage /> },

            // 하루 일정
            { path: "/days", element: <DayListPage /> },
            { path: "/days/:id", element: <DayDetailPage /> },

            // 장소 보관함
            { path: "/spots", element: <SpotListPage /> },
            { path: "/spots/:id", element: <SpotDetailPage /> },
        ],
    },
    {
        // 3. 잘못된 경로는 홈으로 리다이렉트
        path: "*",
        element: <Navigate to="/" replace />,
    },
]);