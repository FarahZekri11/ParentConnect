import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ApiErrorResponse } from '../types';

// URL de base vers l'API Gateway centralisé UNIQUE
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Clé de stockage sécurisée du token (sessionStorage pour isoler par onglet et vider à la fermeture)
const TOKEN_KEY = 'pc_access_token';

export const getStoredToken = (): string | null => {
  return sessionStorage.getItem(TOKEN_KEY);
};

export const setStoredToken = (token: string): void => {
  sessionStorage.setItem(TOKEN_KEY, token);
};

export const removeStoredToken = (): void => {
  sessionStorage.removeItem(TOKEN_KEY);
};

// Instance Axios configurée vers l'API Gateway
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Event listeners custom pour notifier l'UI en cas d'erreur globale
type AuthErrorCallback = (type: 'UNAUTHORIZED' | 'FORBIDDEN', message?: string) => void;
const authErrorListeners: AuthErrorCallback[] = [];

export const onAuthError = (cb: AuthErrorCallback) => {
  authErrorListeners.push(cb);
  return () => {
    const idx = authErrorListeners.indexOf(cb);
    if (idx !== -1) authErrorListeners.splice(idx, 1);
  };
};

const notifyAuthError = (type: 'UNAUTHORIZED' | 'FORBIDDEN', message?: string) => {
  authErrorListeners.forEach((listener) => listener(type, message));
};

// 1. Intercepteur de Requête : injection automatique du Bearer token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 2. Intercepteur de Réponse : gestion fine du 401 (redirection login) et 403 (alerte d'accès refusé)
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    if (error.response) {
      const status = error.response.status;
      const errorMsg = error.response.data?.message || error.response.data?.error || 'Erreur réseau';

      if (status === 401) {
        // Token absent, invalide ou expiré -> on purge et déclenche la redirection vers /login
        removeStoredToken();
        notifyAuthError('UNAUTHORIZED', errorMsg);
        
        // Si l'utilisateur n'est pas déjà sur la page de login, on redirige
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        }
      } else if (status === 403) {
        // Rôle insuffisant -> afficher un message refusé sans déconnecter
        notifyAuthError('FORBIDDEN', errorMsg || "Accès refusé : vous n'avez pas les permissions requises.");
      }
    }
    return Promise.reject(error);
  }
);
