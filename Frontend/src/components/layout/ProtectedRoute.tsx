import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  // Si non authentifié -> redirection vers la page de login avec sauvegarde de l'URL cible
  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Si un rôle spécifique est requis et non possédé -> affichage d'un écran 403 Forbidden
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="mx-auto mt-20 max-w-md rounded-lg bg-red-50 p-6 text-center shadow">
        <h2 className="text-2xl font-bold text-red-700">403 - Accès Refusé</h2>
        <p className="mt-2 text-gray-700">
          Votre rôle (<span className="font-semibold">{user.role}</span>) ne vous autorise pas à accéder à cette
          section.
        </p>
      </div>
    );
  }

  return <Outlet />;
};
