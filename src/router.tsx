// src/router.tsx
import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

// Pages
const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ExplorePage = lazy(() => import("./pages/ExplorePage"));
const PlanListPage = lazy(() => import("./pages/PlanListPage"));
const PlanCreatePage = lazy(() => import("./pages/PlanCreatePage"));
const PlanDetailPage = lazy(() => import("./pages/PlanDetailPage"));
const DayListPage = lazy(() => import("./pages/DayListPage"));
const DayDetailPage = lazy(() => import("./pages/DayDetailPage"));
const SpotListPage = lazy(() => import("./pages/SpotListPage"));
const SpotDetailPage = lazy(() => import("./pages/SpotDetailPage"));
const SpotDataUpdater = lazy(() => import("./pages/SpotDataUpdater"));

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
            { path: "/spots/test/renew", element: <SpotDataUpdater /> },
            { path: "/spots/:id", element: <SpotDetailPage /> },
        ],
    },
    {
        // 3. 잘못된 경로는 홈으로 리다이렉트
        path: "*",
        element: <Navigate to="/" replace />,
    },
]);
