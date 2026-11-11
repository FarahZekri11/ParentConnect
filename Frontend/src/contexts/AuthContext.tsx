import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, LoginPayload, RegisterPayload, UserRole } from '../types';
import { authApi } from '../api/endpoints';
import { getStoredToken, setStoredToken, removeStoredToken, onAuthError } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  forbiddenMessage: string | null;
  clearForbiddenMessage: () => void;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  hasRole: (allowedRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);

  const clearForbiddenMessage = () => setForbiddenMessage(null);

  // Charger le profil de l'utilisateur au montage si un token est présent
  const fetchCurrentUser = useCallback(async () => {
    const currentToken = getStoredToken();
    if (!currentToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch {
      // Si le token est invalide ou expiré, getMe échouera et l'intercepteur gérera le 401
      setUser(null);
      removeStoredToken();
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();

    // Écouteur global pour afficher les erreurs 403 (sans déconnexion)
    const cleanupAuthError = onAuthError((type, message) => {
      if (type === 'FORBIDDEN') {
        setForbiddenMessage(message || "Accès refusé : vous n'avez pas les droits nécessaires.");
      } else if (type === 'UNAUTHORIZED') {
        setUser(null);
        setToken(null);
      }
    });

    return () => {
      cleanupAuthError();
    };
  }, [fetchCurrentUser]);

  const login = async (payload: LoginPayload) => {
    setIsLoading(true);
    try {
      const data = await authApi.login(payload);
      setStoredToken(data.token);
      setToken(data.token);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: RegisterPayload) => {
    setIsLoading(true);
    try {
      const data = await authApi.register(payload);
      setStoredToken(data.token);
      setToken(data.token);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    removeStoredToken();
    setToken(null);
    setUser(null);
  };

  const hasRole = (allowedRoles: UserRole[]): boolean => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        forbiddenMessage,
        clearForbiddenMessage,
        login,
        register,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
