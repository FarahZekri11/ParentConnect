import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
  createdTimestamp: number | null;
  roles: string[];
  role: string | null;
}

export interface ModuleStats {
  available: boolean;
  [key: string]: unknown;
}

export interface AdminStats {
  generatedAt: string;
  users: {
    total: number;
    byRole: Record<string, number>;
    disabled: number;
    registrationsByDay: { date: string; count: number }[];
    recent: AdminUser[];
  };
  modules: Record<string, ModuleStats>;
}

export interface UserPage {
  total: number;
  first: number;
  max: number;
  items: AdminUser[];
}

/** API d'administration de la Gateway (/api/admin/**, rôle ADMIN vérifié côté serveur). */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/admin`;

  stats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.base}/stats`);
  }

  users(search: string, role: string, first: number, max: number): Observable<UserPage> {
    let params = new HttpParams().set('first', first).set('max', max);
    if (search.trim()) params = params.set('search', search.trim());
    if (role) params = params.set('role', role);
    return this.http.get<UserPage>(`${this.base}/users`, { params });
  }

  updateUser(id: string, body: { firstName: string; lastName: string; email: string }): Observable<unknown> {
    return this.http.put(`${this.base}/users/${id}`, body);
  }

  setEnabled(id: string, enabled: boolean): Observable<unknown> {
    return this.http.put(`${this.base}/users/${id}/enabled`, { enabled });
  }

  setRole(id: string, role: string): Observable<unknown> {
    return this.http.put(`${this.base}/users/${id}/role`, { role });
  }

  deleteUser(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/users/${id}`);
  }

  errorMessage(err: unknown, fallback: string): string {
    const http = err as HttpErrorResponse;
    if (typeof http?.error?.error === 'string') return http.error.error;
    if (http?.status === 0) return 'Plateforme injoignable.';
    if (http?.status === 403) return 'Accès réservé aux administrateurs.';
    return fallback;
  }
}
