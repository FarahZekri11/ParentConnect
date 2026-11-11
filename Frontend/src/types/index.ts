// Types du domaine ParentConnect

export type UserRole = 'PARENT' | 'PROFESSIONAL' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: User;
}

export interface LoginPayload {
  email?: string;
  username?: string;
  password?: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  password?: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  content: string;
  createdAt: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  categoryId?: string;
  categoryName?: string;
  commentsCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  slug?: string;
}

export interface ReportPayload {
  reason: string;
  details?: string;
}

export interface Report {
  id: string;
  postId: string;
  reporterId: string;
  reason: string;
  details?: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
}

export interface BabysittingBooking {
  id: string;
  requesterId: string;
  babysitterId?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';
  date: string;
  startTime: string;
  endTime: string;
  childrenCount: number;
  notes?: string;
  createdAt: string;
}

export interface ApiErrorResponse {
  message?: string;
  error?: string;
  code?: string;
  status?: number;
}
