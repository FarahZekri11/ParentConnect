import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, of, catchError, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  UserLocation,
  NearbyParent,
  Neighborhood,
  MeetingPoint,
  MeetingPointType,
  TrustCircle,
  CircleLevel,
  AddressVerification,
  AddressValidationActionResponse,
  VerificationMethod,
  ProximityResult,
  GeoPoint,
  GeoPolygon,
} from '../models/geo.models';

// ---------------------------------------------------------------------------
// Géolocalisation (service FastAPI + MongoDB) via la Gateway, préfixe /api/geo.
// Le serveur floute toute position (~200 m, décalage HMAC stable) : la position exacte n'est jamais stockée.
// Aucune donnée simulée : en cas d'erreur, l'appelant reçoit l'erreur et l'affiche.
// ---------------------------------------------------------------------------

export interface MeetingPointInput {
  neighborhood_id: string;
  name: string;
  type: MeetingPointType;
  location: GeoPoint;
}

export interface NeighborhoodInput {
  name: string;
  city: string;
  boundary: GeoPolygon;
  center: GeoPoint;
}

@Injectable({ providedIn: 'root' })
export class GeoService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/geo`;

  private currentLocationSubject = new BehaviorSubject<UserLocation | null>(null);
  currentLocation$ = this.currentLocationSubject.asObservable();

  private circlesSubject = new BehaviorSubject<TrustCircle[]>([]);
  circles$ = this.circlesSubject.asObservable();

  private myVerificationSubject = new BehaviorSubject<AddressVerification | null>(null);
  myVerification$ = this.myVerificationSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.myVerificationSubject.next(this.loadCachedVerification());
  }

  // ------------------------------------------------------------ positions
  /** Ma position floutée ; null si je n'ai pas (ou plus) partagé de position. */
  getMyLocation(): Observable<UserLocation | null> {
    return this.http.get<UserLocation>(`${this.baseUrl}/locations/me`).pipe(
      tap(loc => this.currentLocationSubject.next(loc)),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) {
          this.currentLocationSubject.next(null);
          return of(null);
        }
        throw err;
      })
    );
  }

  /** Envoie une position (avec le consentement de l'utilisateur) : le serveur la floute avant de la stocker. */
  updateLocation(lng: number, lat: number): Observable<UserLocation> {
    return this.http.post<UserLocation>(`${this.baseUrl}/locations`, { lng, lat }).pipe(
      tap(loc => this.currentLocationSubject.next(loc))
    );
  }

  /** Retrait du consentement : la position floutée est supprimée côté serveur. */
  deleteMyLocation(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/locations/me`).pipe(
      tap(() => this.currentLocationSubject.next(null))
    );
  }

  /** Parents à proximité : identifiants anonymes et distances arrondies à 100 m (anti-triangulation). */
  getNearbyParents(lng: number, lat: number, radius = 2500): Observable<NearbyParent[]> {
    const params = new HttpParams()
      .set('lng', lng.toString())
      .set('lat', lat.toString())
      .set('radius', Math.min(radius, 20000).toString());
    return this.http.get<NearbyParent[]>(`${this.baseUrl}/nearby`, { params }).pipe(
      map(parents => this.withTrustLevel(parents))
    );
  }

  getProximityWithUser(userId: string): Observable<ProximityResult> {
    return this.http.get<ProximityResult>(`${this.baseUrl}/users/${encodeURIComponent(userId)}/proximity`);
  }

  // ------------------------------------------------------------ quartiers
  getNeighborhoods(): Observable<Neighborhood[]> {
    return this.http.get<Neighborhood[]>(`${this.baseUrl}/neighborhoods`);
  }

  getNeighborhoodById(id: string): Observable<Neighborhood> {
    return this.http.get<Neighborhood>(`${this.baseUrl}/neighborhoods/${encodeURIComponent(id)}`);
  }

  getNeighborhoodByPoint(lng: number, lat: number): Observable<Neighborhood | null> {
    const params = new HttpParams().set('lng', lng.toString()).set('lat', lat.toString());
    return this.http.get<Neighborhood>(`${this.baseUrl}/neighborhoods/by-point`, { params }).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404) return of(null);
        throw err;
      })
    );
  }

  createNeighborhood(input: NeighborhoodInput): Observable<Neighborhood> {
    return this.http.post<Neighborhood>(`${this.baseUrl}/neighborhoods`, input);
  }

  updateNeighborhood(id: string, input: NeighborhoodInput): Observable<Neighborhood> {
    return this.http.put<Neighborhood>(`${this.baseUrl}/neighborhoods/${encodeURIComponent(id)}`, input);
  }

  deleteNeighborhood(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/neighborhoods/${encodeURIComponent(id)}`);
  }

  // ---------------------------------------------------- points de rencontre
  /** Points de rencontre d'un quartier, ou tous les points (carte) si aucun quartier n'est donné. */
  getMeetingPoints(neighborhoodId?: string): Observable<MeetingPoint[]> {
    const params = neighborhoodId ? new HttpParams().set('neighborhoodId', neighborhoodId) : undefined;
    return this.http.get<MeetingPoint[]>(`${this.baseUrl}/meeting-points`, { params });
  }

  createMeetingPoint(input: MeetingPointInput): Observable<MeetingPoint> {
    return this.http.post<MeetingPoint>(`${this.baseUrl}/meeting-points`, input);
  }

  updateMeetingPoint(id: string, changes: Partial<MeetingPointInput>): Observable<MeetingPoint> {
    return this.http.put<MeetingPoint>(`${this.baseUrl}/meeting-points/${encodeURIComponent(id)}`, changes);
  }

  deleteMeetingPoint(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/meeting-points/${encodeURIComponent(id)}`);
  }

  // ------------------------------------------------------- cercles de confiance
  getTrustCircles(): Observable<TrustCircle[]> {
    return this.http.get<TrustCircle[]>(`${this.baseUrl}/circles`).pipe(
      tap(circles => this.circlesSubject.next(circles))
    );
  }

  saveTrustCircle(level: CircleLevel, members: string[]): Observable<TrustCircle> {
    return this.http.post<TrustCircle>(`${this.baseUrl}/circles`, { level, members }).pipe(
      tap(circle => {
        const updated = this.circlesSubject.value.filter(c => c.level !== level);
        updated.push(circle);
        this.circlesSubject.next(updated);
      })
    );
  }

  // ---------------------------------------------- vérification d'adresse
  requestAddressVerification(method: VerificationMethod = 'neighbor_validation'): Observable<AddressVerification> {
    return this.http.post<AddressVerification>(`${this.baseUrl}/addresses/verify`, { method }).pipe(
      tap(verif => {
        this.cacheVerification(verif);
        this.myVerificationSubject.next(verif);
      })
    );
  }

  validateNeighborAddress(verificationId: string): Observable<AddressValidationActionResponse> {
    return this.http.post<AddressValidationActionResponse>(
      `${this.baseUrl}/addresses/${encodeURIComponent(verificationId)}/validate`, {}
    );
  }

  // ------------------------------------------------------------ utilitaires
  errorMessage(err: unknown, fallback: string): string {
    const http = err as HttpErrorResponse;
    if (http?.status === 0) return 'Service de géolocalisation indisponible. Vérifiez que la plateforme est démarrée.';
    if (http?.status === 403) return 'Action réservée aux administrateurs.';
    const detail = http?.error?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return `Données invalides : ${detail[0].msg}`;
    return fallback;
  }

  private withTrustLevel(parents: NearbyParent[]): NearbyParent[] {
    const circles = this.circlesSubject.value;
    const close = circles.find(c => c.level === 'close')?.members ?? [];
    const neighborhood = circles.find(c => c.level === 'neighborhood')?.members ?? [];
    return parents.map(p => ({
      ...p,
      displayName: p.displayName || `Parent n°${p.user_id.substring(0, 4).toUpperCase()}`,
      trustLevel: close.includes(p.user_id) ? 'close' : neighborhood.includes(p.user_id) ? 'neighborhood' : 'none',
    }));
  }

  /** La dernière demande de vérification (réponse réelle du service) est mémorisée par utilisateur. */
  private get verificationKey(): string {
    return `pc_geo_verification_${this.authService.currentUser?.id ?? 'anonyme'}`;
  }

  private loadCachedVerification(): AddressVerification | null {
    try {
      const data = localStorage.getItem(this.verificationKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private cacheVerification(verif: AddressVerification): void {
    try {
      localStorage.setItem(this.verificationKey, JSON.stringify(verif));
    } catch {
      // stockage indisponible : sans conséquence
    }
  }
}
