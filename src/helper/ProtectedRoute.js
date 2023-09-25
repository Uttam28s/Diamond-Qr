import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./useAuth";
console.log("🚀 ~ file: ProtectedRoute.js:3 ~ useAuth:", () => useAuth())

export const PrivateRoute = () => useAuth() ? <Outlet /> : <Navigate to="/login" />;

export const RestrictedRoutes = () => !useAuth() ? <Outlet /> : <Navigate to="/diamond" />;