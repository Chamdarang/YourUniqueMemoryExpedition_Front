import { Navigate } from "react-router-dom";

// 🔒 로그인한 사용자만 접근 가능
export const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
    const token = localStorage.getItem('accessToken');
    return token ? <>{children}</> : <Navigate to="/login" replace />;
};

// 🔓 비로그인 사용자만 접근 가능 (로그인 페이지 등)
export const PublicRoute = ({ children }: { children: React.ReactNode }) => {
    const token = localStorage.getItem('accessToken');
    return !token ? <>{children}</> : <Navigate to="/" replace />;
};
