import { apiClient } from './client';
import {
  AuthResponse,
  LoginPayload,
  RegisterPayload,
  User,
  Post,
  Comment,
  Category,
  ReportPayload,
  Report,
  BabysittingBooking,
} from '../types';

/**
 * Service API aligné strictement sur les routes de l'API Gateway centralisé (http://localhost:8080)
 */

// ── 1. Authentification & Profil ──────────────────────────────────
export const authApi = {
  // Inscription : POST /api/auth/register (Public)
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/api/auth/register', payload);
    return res.data;
  },

  // Connexion : POST /api/auth/login (Public)
  login: async (payload: LoginPayload): Promise<AuthResponse> => {
    const res = await apiClient.post<AuthResponse>('/api/auth/login', payload);
    return res.data;
  },

  // Mon Profil : GET /api/auth/me (Authentifié)
  getMe: async (): Promise<User> => {
    const res = await apiClient.get<User>('/api/auth/me');
    return res.data;
  },
};

// ── 2. Posts & Commentaires ───────────────────────────────────────
export const postsApi = {
  // Liste des posts : GET /api/posts (Public)
  getPosts: async (params?: { categoryId?: string; page?: number }): Promise<Post[]> => {
    const res = await apiClient.get<Post[]>('/api/posts', { params });
    return res.data;
  },

  // Récupérer un post spécifique
  getPostById: async (id: string): Promise<Post> => {
    const res = await apiClient.get<Post>(`/api/posts/${id}`);
    return res.data;
  },

  // Créer un Post : POST /api/posts (PARENT, PROFESSIONAL, ADMIN)
  createPost: async (payload: { title: string; content: string; categoryId?: string }): Promise<Post> => {
    const res = await apiClient.post<Post>('/api/posts', payload);
    return res.data;
  },

  // Commentaires d'un Post : GET /api/posts/{id}/comments (Public)
  getComments: async (postId: string): Promise<Comment[]> => {
    const res = await apiClient.get<Comment[]>(`/api/posts/${postId}/comments`);
    return res.data;
  },

  // Ajouter un Commentaire : POST /api/posts/{id}/comments (PARENT, PROFESSIONAL, ADMIN)
  addComment: async (postId: string, payload: { content: string }): Promise<Comment> => {
    const res = await apiClient.post<Comment>(`/api/posts/${postId}/comments`, payload);
    return res.data;
  },

  // Signaler un Post : POST /api/posts/{id}/report (PARENT, PROFESSIONAL, ADMIN)
  reportPost: async (postId: string, payload: ReportPayload): Promise<{ message: string }> => {
    const res = await apiClient.post<{ message: string }>(`/api/posts/${postId}/report`, payload);
    return res.data;
  },
};

// ── 3. Catégories ─────────────────────────────────────────────────
export const categoriesApi = {
  // Catégories : GET /api/categories (Public)
  getCategories: async (): Promise<Category[]> => {
    const res = await apiClient.get<Category[]>('/api/categories');
    return res.data;
  },

  // Créer une Catégorie : POST /api/categories (ADMIN uniquement)
  createCategory: async (payload: { name: string; description?: string }): Promise<Category> => {
    const res = await apiClient.post<Category>('/api/categories', payload);
    return res.data;
  },
};

// ── 4. Administration & Modération ────────────────────────────────
export const adminApi = {
  // Modération Signalements : GET /api/admin/reports (ADMIN uniquement)
  getReports: async (): Promise<Report[]> => {
    const res = await apiClient.get<Report[]>('/api/admin/reports');
    return res.data;
  },

  // Résoudre un signalement
  resolveReport: async (reportId: string, action: 'RESOLVE' | 'DISMISS'): Promise<void> => {
    await apiClient.patch(`/api/admin/reports/${reportId}`, { action });
  },
};

// ── 5. Garde d'enfants (Babysitting) ──────────────────────────────
export const babysittingApi = {
  // GET /api/babysitting/ (Liste ou recherche de gardes)
  getBookings: async (): Promise<BabysittingBooking[]> => {
    const res = await apiClient.get<BabysittingBooking[]>('/api/babysitting/');
    return res.data;
  },

  // POST /api/babysitting/ (Créer une demande de garde)
  createBooking: async (payload: {
    date: string;
    startTime: string;
    endTime: string;
    childrenCount: number;
    notes?: string;
  }): Promise<BabysittingBooking> => {
    const res = await apiClient.post<BabysittingBooking>('/api/babysitting/', payload);
    return res.data;
  },
};
