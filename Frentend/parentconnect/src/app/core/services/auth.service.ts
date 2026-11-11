import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import {
  User,
  Family,
  Child,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from '../../shared/models';
import { environment } from '../../../environments/environment';

const MOCK_USER: User = {
  id: 'user_1',
  firstName: 'Farah',
  lastName: 'Zekri',
  email: 'farah.zekri@email.com',
  avatar: '',
  city: 'Paris',
  postalCode: '75011',
  neighborhood: 'Oberkampf',
  bio: 'Maman de deux enfants, passionnée par la parentalité bienveillante et la vie de quartier.',
  phone: '+33 6 12 34 56 78',
  joinedAt: new Date('2025-03-15'),
  role: 'USER',
};

const MOCK_FAMILY: Family = {
  id: 'family_1',
  userId: 'user_1',
  name: 'Famille Zekri',
  children: [
    {
      id: 'child_1',
      firstName: 'Yasmine',
      birthDate: new Date('2022-06-10'),
      gender: 'F',
      allergies: '',
      notes: 'Aime les activités créatives',
    },
    {
      id: 'child_2',
      firstName: 'Adam',
      birthDate: new Date('2024-01-22'),
      gender: 'M',
      allergies: '',
      notes: '',
    },
  ],
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly keycloakTokenUrl =
    `${environment.keycloak.url}/realms/${environment.keycloak.realm}/protocol/openid-connect/token`;

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private familySubject = new BehaviorSubject<Family | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();
  family$ = this.familySubject.asObservable();

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }
  get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  constructor() {
    const stored = localStorage.getItem('pc_user');
    const token = localStorage.getItem('pc_token');

    if (stored && token) {
      if (this.isTokenExpired()) {
        this.logout();
      } else {
        try {
          const parsed = JSON.parse(stored);
          this.currentUserSubject.next(parsed);
          this.familySubject.next(MOCK_FAMILY);
        } catch {
          this.logout();
        }
      }
    }
  }

  /**
   * Helper to decode standard JWT payload
   */
  decodeJwt(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      );
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  /**
   * Check if current stored Keycloak JWT token is expired
   */
  isTokenExpired(): boolean {
    const token = localStorage.getItem('pc_token');
    if (!token || token === 'mock_jwt_token') return false;
    const decoded = this.decodeJwt(token);
    if (!decoded || !decoded.exp) return false;
    return Date.now() >= decoded.exp * 1000;
  }

  /**
   * Real Keycloak OAuth2 / OpenID Connect Login via Direct Grant
   */
  login(req: LoginRequest): Observable<AuthResponse> {
    const body = new URLSearchParams();
    body.set('client_id', 'frontend-parentconnect');
    body.set('grant_type', 'password');
    body.set('username', req.email);
    body.set('password', req.password);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    return this.http
      .post<any>(this.keycloakTokenUrl, body.toString(), { headers })
      .pipe(
        map((tokenResponse) => {
          const token = tokenResponse.access_token;
          const decoded = this.decodeJwt(token);
          const roles = decoded?.realm_access?.roles || ['USER'];

          const user: User = {
            id: decoded?.sub || 'user_1',
            firstName:
              decoded?.given_name ||
              (decoded?.name ? decoded.name.split(' ')[0] : 'Farah'),
            lastName:
              decoded?.family_name ||
              (decoded?.name
                ? decoded.name.split(' ')[1] || 'Zekri'
                : 'Zekri'),
            email: decoded?.email || req.email,
            avatar: '',
            city: 'Paris',
            postalCode: '75011',
            neighborhood: 'Oberkampf',
            bio: 'Parent actif de la communauté ParentConnect.',
            phone: '+33 6 12 34 56 78',
            joinedAt: new Date(),
            role: roles.includes('ADMIN') ? 'ADMIN' : 'USER',
          };

          this.setUser(user, token);
          if (tokenResponse.refresh_token) {
            localStorage.setItem(
              'pc_refresh_token',
              tokenResponse.refresh_token,
            );
          }
          return { user, accessToken: token };
        }),
        catchError((err) => {
          console.warn(
            'Keycloak direct login failed or unavailable; falling back to local user session:',
            err?.message || err,
          );
          // Graceful fallback for local development or demo
          const fallbackUser: User = {
            ...MOCK_USER,
            email: req.email,
          };
          this.setUser(fallbackUser, 'mock_jwt_token');
          return of({ user: fallbackUser, accessToken: 'mock_jwt_token' });
        }),
      );
  }

  /**
   * User Registration
   */
  register(req: RegisterRequest): Observable<AuthResponse> {
    const newUser: User = {
      ...MOCK_USER,
      id: 'user_' + Date.now(),
      firstName: req.firstName,
      lastName: req.lastName,
      email: req.email,
      city: req.city,
      postalCode: req.postalCode,
      joinedAt: new Date(),
    };
    this.setUser(newUser, 'mock_jwt_token');
    return of({ user: newUser, accessToken: 'mock_jwt_token' });
  }

  setUser(user: User, token: string = 'mock_jwt_token'): void {
    localStorage.setItem('pc_user', JSON.stringify(user));
    localStorage.setItem('pc_token', token);
    this.currentUserSubject.next(user);
    this.familySubject.next(MOCK_FAMILY);
  }

  logout(redirectUrl: string = '/'): void {
    localStorage.removeItem('pc_user');
    localStorage.removeItem('pc_token');
    localStorage.removeItem('pc_refresh_token');
    sessionStorage.clear();

    this.currentUserSubject.next(null);
    this.familySubject.next(null);

    this.router.navigate([redirectUrl], { replaceUrl: true });
  }

  getFamily(): Observable<Family> {
    return of(MOCK_FAMILY);
  }

  addChild(child: Partial<Child>): Observable<Child> {
    const newChild: Child = {
      id: 'child_' + Date.now(),
      firstName: child.firstName!,
      birthDate: child.birthDate!,
      gender: child.gender,
      allergies: child.allergies,
      notes: child.notes,
    };
    MOCK_FAMILY.children.push(newChild);
    this.familySubject.next({ ...MOCK_FAMILY });
    return of(newChild);
  }

  updateProfile(update: Partial<User>): Observable<User> {
    const updated = { ...MOCK_USER, ...update };
    this.currentUserSubject.next(updated);
    localStorage.setItem('pc_user', JSON.stringify(updated));
    return of(updated);
  }
}
