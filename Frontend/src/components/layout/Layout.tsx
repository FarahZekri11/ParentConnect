import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { useAuth } from '../../contexts/AuthContext';

export const Layout: React.FC = () => {
  const { forbiddenMessage, clearForbiddenMessage } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      {/* Alerte globale 403 Forbidden sans déconnexion */}
      {forbiddenMessage && (
        <div className="bg-red-500 text-white px-4 py-3 shadow-md flex justify-between items-center transition-all">
          <div className="flex items-center space-x-2">
            <span className="font-bold">⛔ Accès Restreint :</span>
            <span>{forbiddenMessage}</span>
          </div>
          <button
            onClick={clearForbiddenMessage}
            className="text-white hover:text-gray-200 font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-gray-200 py-6 text-center text-sm text-gray-500">
        ParentConnect © 2026 - Plateforme d'échange & entraide communautaire sécurisée.
      </footer>
    </div>
  );
};
