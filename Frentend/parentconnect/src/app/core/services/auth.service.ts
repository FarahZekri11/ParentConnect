import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import {
  User,
  Family,
  Child,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from '../../shared/models';
import { environment } from '../../../environments/environment';

/** Données de profil saisies par l'utilisateur (non portées par le token Keycloak). */
type ProfileExtras = Pick<User, 'phone' | 'city' | 'postalCode' | 'neighborhood' | 'bio' | 'avatar'> & {
  firstName?: string;
  lastName?: string;
};

/** Compte local de secours, utilisé seulement si Keycloak est injoignable (démonstration hors ligne). */
const OFFLINE_USER: User = {
  id: 'offline_user',
  firstName: 'Parent',
  lastName: 'Démo',
  email: 'demo@parentconnect.local',
  avatar: '',
  joinedAt: new Date(),
  role: 'USER',
};

/**
 * Authentification Keycloak (realm « parentconnect ») et données personnelles de l'utilisateur.
 * - Connexion : grant « password » sur le client public frontend-parentconnect.
 * - Inscription : POST /api/auth/register (API Gateway) crée le compte Keycloak avec le rôle PARENT,
 *   puis connexion automatique.
 * - Famille et profil : propres à chaque compte, gardés dans ce navigateur (aucun service Famille côté
 *   backend pour le moment). Chaque nouveau compte commence avec « Famille <Nom> », sans enfant.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  private readonly keycloakTokenUrl =
    `${environment.keycloak.url}/realms/${environment.keycloak.realm}/protocol/openid-connect/token`;
  private readonly registerUrl = `${environment.apiBaseUrl}/api/auth/register`;

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
      // Anciennes sessions fictives (avant l'inscription réelle) : refusées par les API, on les efface
      if (token === 'mock_jwt_token' || this.isTokenExpired()) {
        this.clearSession();
      } else {
        try {
          const parsed: User = JSON.parse(stored);
          this.currentUserSubject.next(parsed);
          this.familySubject.next(this.loadFamily(parsed));
        } catch {
          this.clearSession();
        }
      }
    }
  }

  /** Décode la partie « payload » d'un JWT. */
  decodeJwt(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
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

  /** Vrai si le token Keycloak stocké est expiré. */
  isTokenExpired(): boolean {
    const token = localStorage.getItem('pc_token');
    if (!token || token === 'offline_token') return false;
    const decoded = this.decodeJwt(token);
    if (!decoded || !decoded.exp) return false;
    return Date.now() >= decoded.exp * 1000;
  }

  /** Connexion Keycloak (e-mail ou identifiant + mot de passe). */
  login(req: LoginRequest): Observable<AuthResponse> {
    const body = new URLSearchParams();
    body.set('client_id', environment.keycloak.clientId);
    body.set('grant_type', 'password');
    body.set('username', req.email);
    body.set('password', req.password);

    const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });

    return this.http.post<any>(this.keycloakTokenUrl, body.toString(), { headers }).pipe(
      map((tokenResponse) => {
        const token = tokenResponse.access_token;
        const decoded = this.decodeJwt(token);
        const roles: string[] = decoded?.realm_access?.roles || ['USER'];
        const id: string = decoded?.sub;
        const extras = this.loadExtras(id);

        const user: User = {
          id,
          firstName: extras.firstName || decoded?.given_name || (decoded?.name ? decoded.name.split(' ')[0] : ''),
          lastName: extras.lastName || decoded?.family_name || (decoded?.name ? decoded.name.split(' ').slice(1).join(' ') : ''),
          email: decoded?.email || req.email,
          avatar: extras.avatar || '',
          city: extras.city || '',
          postalCode: extras.postalCode || '',
          neighborhood: extras.neighborhood || '',
          bio: extras.bio || '',
          phone: extras.phone || '',
          joinedAt: decoded?.iat ? new Date(decoded.iat * 1000) : new Date(),
          role: roles.includes('ADMIN') ? 'ADMIN' : 'USER',
          roles,
        };

        this.setUser(user, token);
        if (tokenResponse.refresh_token) {
          localStorage.setItem('pc_refresh_token', tokenResponse.refresh_token);
        }
        return { user, accessToken: token };
      }),
      catchError((err) => {
        // Identifiants refusés : on signale l'erreur (pas de faux utilisateur, sinon toutes les API répondraient 401).
        if (err?.status && err.status !== 0) {
          return throwError(() => err);
        }
        // Keycloak injoignable : session locale de démonstration, sans accès aux API
        console.warn('Keycloak unavailable; local offline session:', err?.message || err);
        const offline: User = { ...OFFLINE_USER, email: req.email };
        this.setUser(offline, 'offline_token');
        return of({ user: offline, accessToken: 'offline_token' });
      }),
    );
  }

  /**
   * Inscription réelle : la Gateway crée le compte Keycloak (rôle PARENT), puis connexion automatique.
   * La famille « Famille <Nom> » (sans enfant) et la ville saisie sont initialisées pour ce compte.
   */
  register(req: RegisterRequest): Observable<AuthResponse> {
    const body = {
      firstName: req.firstName.trim(),
      lastName: req.lastName.trim(),
      email: req.email.trim(),
      password: req.password,
      role: req.role === 'BABYSITTER' ? 'BABYSITTER' : 'PARENT',
    };
    return this.http.post<{ id: string }>(this.registerUrl, body).pipe(
      switchMap((created) => {
        this.saveExtras(created.id, {
          firstName: body.firstName,
          lastName: body.lastName,
          city: req.city?.trim() || '',
          postalCode: req.postalCode?.trim() || '',
        });
        return this.login({ email: body.email, password: req.password });
      }),
    );
  }

  setUser(user: User, token: string): void {
    localStorage.setItem('pc_user', JSON.stringify(user));
    localStorage.setItem('pc_token', token);
    this.currentUserSubject.next(user);
    this.familySubject.next(this.loadFamily(user));
  }

  logout(redirectUrl: string = '/'): void {
    this.clearSession();
    this.router.navigate([redirectUrl], { replaceUrl: true });
  }

  private clearSession(): void {
    localStorage.removeItem('pc_user');
    localStorage.removeItem('pc_token');
    localStorage.removeItem('pc_refresh_token');
    sessionStorage.clear();
    this.currentUserSubject.next(null);
    this.familySubject.next(null);
  }

  // ----------------------------------------------------------------- famille
  getFamily(): Observable<Family> {
    const user = this.currentUser;
    return user ? of(this.loadFamily(user)) : throwError(() => new Error('Non connecté'));
  }

  addChild(child: Partial<Child>): Observable<Child> {
    const family = this.requireFamily();
    const newChild: Child = {
      id: 'child_' + Date.now(),
      firstName: child.firstName!,
      birthDate: child.birthDate!,
      gender: child.gender,
      allergies: child.allergies,
      notes: child.notes,
    };
    this.saveFamily({ ...family, children: [...family.children, newChild] });
    return of(newChild);
  }

  removeChild(childId: string): Observable<void> {
    const family = this.requireFamily();
    this.saveFamily({ ...family, children: family.children.filter((c) => c.id !== childId) });
    return of(undefined);
  }

  renameFamily(name: string): Observable<Family> {
    const family = this.requireFamily();
    const updated = { ...family, name: name.trim() || family.name };
    this.saveFamily(updated);
    return of(updated);
  }

  private requireFamily(): Family {
    const user = this.currentUser;
    if (!user) throw new Error('Non connecté');
    return this.loadFamily(user);
  }

  private loadFamily(user: User): Family {
    try {
      const raw = localStorage.getItem(`pc_family_${user.id}`);
      if (raw) {
        const family: Family = JSON.parse(raw);
        family.children = (family.children || []).map((c) => ({ ...c, birthDate: new Date(c.birthDate) }));
        return family;
      }
    } catch {
      // donnée illisible : famille par défaut
    }
    return {
      id: `family_${user.id}`,
      userId: user.id,
      name: user.lastName ? `Famille ${user.lastName}` : 'Ma famille',
      children: [],
    };
  }

  private saveFamily(family: Family): void {
    try {
      localStorage.setItem(`pc_family_${family.userId}`, JSON.stringify(family));
    } catch {
      // stockage indisponible (navigation privée)
    }
    this.familySubject.next(family);
  }

  // ------------------------------------------------------------------- rôles
  /** Vrai si l'utilisateur connecté possède ce rôle Keycloak (ADMIN, PARENT, BABYSITTER...). */
  hasRole(role: string): boolean {
    const user = this.currentUser;
    if (!user) return false;
    const roles = (user.roles ?? []).map(r => r.toUpperCase());
    return roles.includes(role.toUpperCase()) || (role.toUpperCase() === 'ADMIN' && user.role === 'ADMIN');
  }

  /** Libellé du rôle principal (ADMIN > BABYSITTER > PARENT). */
  primaryRoleLabel(): string {
    if (this.hasRole('ADMIN')) return 'Administrateur';
    if (this.hasRole('PROFESSIONAL')) return 'Professionnel';
    if (this.hasRole('BABYSITTER')) return 'Babysitter';
    if (this.hasRole('PARENT')) return 'Parent';
    return 'Utilisateur';
  }

  /** Changement de mot de passe (vérification de l'actuel par Keycloak, via la Gateway). */
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>(`${this.registerUrl.replace('/register', '')}/me/password`, { currentPassword, newPassword });
  }

  // ------------------------------------------------------------------ profil
  updateProfile(update: Partial<User>): Observable<User> {
    const current = this.currentUser;
    if (!current) return throwError(() => new Error('Non connecté'));
    const updated: User = { ...current, ...update, id: current.id, email: current.email, role: current.role, roles: current.roles };
    const namesChanged = updated.firstName !== current.firstName || updated.lastName !== current.lastName;
    const token = localStorage.getItem('pc_token');
    if (namesChanged && token && token !== 'offline_token') {
      // Prénom et nom enregistrés dans Keycloak (ils apparaissent ensuite dans tous les services)
      return this.http.put(`${this.registerUrl.replace('/register', '')}/me`,
        { firstName: updated.firstName, lastName: updated.lastName }).pipe(
        map(() => this.saveProfileLocally(current, updated)),
      );
    }
    return of(this.saveProfileLocally(current, updated));
  }

  private saveProfileLocally(current: User, updated: User): User {
    this.saveExtras(current.id, {
      firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone, city: updated.city,
      postalCode: updated.postalCode, neighborhood: updated.neighborhood, bio: updated.bio, avatar: updated.avatar,
    });
    localStorage.setItem('pc_user', JSON.stringify(updated));
    this.currentUserSubject.next(updated);
    return updated;
  }

  private loadExtras(userId: string): ProfileExtras {
    try {
      return JSON.parse(localStorage.getItem(`pc_profile_${userId}`) || '{}');
    } catch {
      return {};
    }
  }

  private saveExtras(userId: string, extras: ProfileExtras): void {
    try {
      localStorage.setItem(`pc_profile_${userId}`, JSON.stringify({ ...this.loadExtras(userId), ...extras }));
    } catch {
      // stockage indisponible
    }
  }
}
