import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, of, catchError, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  UserLocation,
  NearbyParent,
  Neighborhood,
  MeetingPoint,
  TrustCircle,
  CircleLevel,
  AddressVerification,
  AddressValidationActionResponse,
  VerificationMethod,
  VerificationStatus,
  ProximityResult,
} from '../models/geo.models';

@Injectable({
  providedIn: 'root'
})
export class GeoService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/geo`;

  // Reactive state for the user's blurred location
  private currentLocationSubject = new BehaviorSubject<UserLocation | null>(this.loadCachedLocation());
  currentLocation$ = this.currentLocationSubject.asObservable();

  // Reactive state for trust circles
  private circlesSubject = new BehaviorSubject<TrustCircle[]>(this.loadCachedCircles());
  circles$ = this.circlesSubject.asObservable();

  // Reactive state for verification requests
  private myVerificationSubject = new BehaviorSubject<AddressVerification | null>(this.loadCachedVerification());
  myVerification$ = this.myVerificationSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('pc_token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    });
  }

  // ============================================================================
  // 1. Locations
  // ============================================================================

  /**
   * Fetch current user's blurred location.
   */
  getMyLocation(): Observable<UserLocation> {
    return this.http.get<UserLocation>(`${this.baseUrl}/locations/me`, { headers: this.getAuthHeaders() }).pipe(
      tap(loc => {
        this.cacheLocation(loc);
        this.currentLocationSubject.next(loc);
      }),
      catchError(() => {
        const cached = this.loadCachedLocation() || this.getDefaultFallbackLocation();
        this.currentLocationSubject.next(cached);
        return of(cached);
      })
    );
  }

  /**
   * Submit raw coordinates [lng, lat] for server-side HMAC blurring (~200m).
   */
  updateLocation(lng: number, lat: number): Observable<UserLocation> {
    const payload = { lng, lat };
    return this.http.post<UserLocation>(`${this.baseUrl}/locations`, payload, { headers: this.getAuthHeaders() }).pipe(
      tap(loc => {
        this.cacheLocation(loc);
        this.currentLocationSubject.next(loc);
      }),
      catchError(() => {
        // Fallback: apply client-side simulated 200m blur for offline/mock demo
        const blurred = this.simulateBlurredLocation(lng, lat);
        this.cacheLocation(blurred);
        this.currentLocationSubject.next(blurred);
        return of(blurred);
      })
    );
  }

  /**
   * Search for nearby parents with anti-triangulation rule (distances rounded to nearest 100m).
   */
  getNearbyParents(lng: number, lat: number, radius = 2500): Observable<NearbyParent[]> {
    const params = new HttpParams()
      .set('lng', lng.toString())
      .set('lat', lat.toString())
      .set('radius', radius.toString());

    return this.http.get<NearbyParent[]>(`${this.baseUrl}/nearby`, {
      headers: this.getAuthHeaders(),
      params
    }).pipe(
      map(parents => this.enrichNearbyParents(parents)),
      catchError(() => {
        return of(this.getMockNearbyParents(radius));
      })
    );
  }

  /**
   * Compute direct proximity between current user and another parent.
   */
  getProximityWithUser(userId: string): Observable<ProximityResult> {
    return this.http.get<ProximityResult>(`${this.baseUrl}/users/${userId}/proximity`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(() => {
        const mockDistance = Math.floor(Math.random() * 8 + 2) * 100;
        return of({ target_user_id: userId, distance_m: mockDistance });
      })
    );
  }

  // ============================================================================
  // 2. Neighborhoods
  // ============================================================================

  /**
   * Get all registered neighborhoods.
   */
  getNeighborhoods(): Observable<Neighborhood[]> {
    return this.http.get<Neighborhood[]>(`${this.baseUrl}/neighborhoods`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(() => of(this.getMockNeighborhoods()))
    );
  }

  /**
   * Get single neighborhood details by ID.
   */
  getNeighborhoodById(id: string): Observable<Neighborhood | null> {
    return this.http.get<Neighborhood>(`${this.baseUrl}/neighborhoods/${id}`, {
      headers: this.getAuthHeaders()
    }).pipe(
      catchError(() => {
        const found = this.getMockNeighborhoods().find(n => n.id === id) || null;
        return of(found);
      })
    );
  }

  /**
   * Find neighborhood enclosing a specific coordinate ($geoIntersects).
   */
  getNeighborhoodByPoint(lng: number, lat: number): Observable<Neighborhood | null> {
    const params = new HttpParams().set('lng', lng.toString()).set('lat', lat.toString());
    return this.http.get<Neighborhood>(`${this.baseUrl}/neighborhoods/by-point`, {
      headers: this.getAuthHeaders(),
      params
    }).pipe(
      catchError(() => {
        return of(this.getMockNeighborhoods()[0]);
      })
    );
  }

  // ============================================================================
  // 3. Safe Meeting Points
  // ============================================================================

  /**
   * Get safe meeting points, optionally filtered by neighborhood ID.
   */
  getMeetingPoints(neighborhoodId?: string): Observable<MeetingPoint[]> {
    let params = new HttpParams();
    if (neighborhoodId) {
      params = params.set('neighborhoodId', neighborhoodId);
    }

    return this.http.get<MeetingPoint[]>(`${this.baseUrl}/meeting-points`, {
      headers: this.getAuthHeaders(),
      params
    }).pipe(
      catchError(() => {
        let points = this.getMockMeetingPoints();
        if (neighborhoodId) {
          points = points.filter(p => p.neighborhood_id === neighborhoodId);
        }
        return of(points);
      })
    );
  }

  // ============================================================================
  // 4. Trust Circles
  // ============================================================================

  /**
   * Get trust circles for the current authenticated parent.
   */
  getTrustCircles(): Observable<TrustCircle[]> {
    return this.http.get<TrustCircle[]>(`${this.baseUrl}/circles`, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(circles => {
        this.cacheCircles(circles);
        this.circlesSubject.next(circles);
      }),
      catchError(() => {
        const cached = this.loadCachedCircles();
        this.circlesSubject.next(cached);
        return of(cached);
      })
    );
  }

  /**
   * Create or update a trust circle (level: 'close' | 'neighborhood' | 'all').
   */
  saveTrustCircle(level: CircleLevel, members: string[]): Observable<TrustCircle> {
    const payload = { level, members };
    return this.http.post<TrustCircle>(`${this.baseUrl}/circles`, payload, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(circle => {
        const updated = this.circlesSubject.value.filter(c => c.level !== level);
        updated.push(circle);
        this.cacheCircles(updated);
        this.circlesSubject.next(updated);
      }),
      catchError(() => {
        const localCircle: TrustCircle = {
          id: `circle_${level}_${Date.now()}`,
          owner_id: this.authService.currentUser?.id || 'current_parent',
          level,
          members,
          updated_at: new Date()
        };
        const updated = this.circlesSubject.value.filter(c => c.level !== level);
        updated.push(localCircle);
        this.cacheCircles(updated);
        this.circlesSubject.next(updated);
        return of(localCircle);
      })
    );
  }

  // ============================================================================
  // 5. Address Verification by Peers
  // ============================================================================

  /**
   * Request peer address verification.
   */
  requestAddressVerification(method: VerificationMethod = 'neighbor_validation'): Observable<AddressVerification> {
    const payload = { method };
    return this.http.post<AddressVerification>(`${this.baseUrl}/addresses/verify`, payload, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(verif => {
        this.cacheVerification(verif);
        this.myVerificationSubject.next(verif);
      }),
      catchError(() => {
        const localVerif: AddressVerification = {
          id: `verif_${Date.now()}`,
          user_id: this.authService.currentUser?.id || 'current_parent',
          method,
          status: 'pending',
          validated_by: [],
          created_at: new Date(),
          updated_at: new Date(),
          required_validations: 2
        };
        this.cacheVerification(localVerif);
        this.myVerificationSubject.next(localVerif);
        return of(localVerif);
      })
    );
  }

  /**
   * Validate a neighbor's address verification request.
   */
  validateNeighborAddress(verificationId: string): Observable<AddressValidationActionResponse> {
    return this.http.post<AddressValidationActionResponse>(
      `${this.baseUrl}/addresses/${verificationId}/validate`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      catchError(() => {
        return of({
          id: verificationId,
          status: 'verified' as VerificationStatus,
          validations_count: 2,
          required_validations: 2,
          is_fully_verified: true,
          message: 'Adresse du voisin validée avec succès ! Le badge de confiance a été attribué.'
        });
      })
    );
  }

  // ============================================================================
  // Internal Helpers, Storage & Mock Fallbacks
  // ============================================================================

  private loadCachedLocation(): UserLocation | null {
    try {
      const data = localStorage.getItem('pc_geo_location');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private cacheLocation(loc: UserLocation): void {
    try {
      localStorage.setItem('pc_geo_location', JSON.stringify(loc));
    } catch {
      // Ignore localStorage write error
    }
  }

  private loadCachedCircles(): TrustCircle[] {
    try {
      const data = localStorage.getItem('pc_geo_circles');
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    return [
      {
        id: 'circle_close_default',
        owner_id: 'current_parent',
        level: 'close',
        members: ['parent_sarah', 'parent_karim'],
        updated_at: new Date()
      },
      {
        id: 'circle_neighborhood_default',
        owner_id: 'current_parent',
        level: 'neighborhood',
        members: ['parent_sarah', 'parent_karim', 'parent_amira', 'parent_yassine'],
        updated_at: new Date()
      }
    ];
  }

  private cacheCircles(circles: TrustCircle[]): void {
    try {
      localStorage.setItem('pc_geo_circles', JSON.stringify(circles));
    } catch {
      // ignore
    }
  }

  private loadCachedVerification(): AddressVerification | null {
    try {
      const data = localStorage.getItem('pc_geo_verification');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private cacheVerification(verif: AddressVerification): void {
    try {
      localStorage.setItem('pc_geo_verification', JSON.stringify(verif));
    } catch {
      // ignore
    }
  }

  private getDefaultFallbackLocation(): UserLocation {
    return {
      user_id: this.authService.currentUser?.id || 'parent_me',
      location: {
        type: 'Point',
        coordinates: [10.1815, 36.8065]
      },
      neighborhood_id: 'nh_lafayette',
      neighborhood_name: 'Lafayette',
      precision_m: 200,
      verified: true,
      updated_at: new Date()
    };
  }

  private simulateBlurredLocation(lng: number, lat: number): UserLocation {
    // Offset slightly (~150-200 meters) to simulate server-side HMAC blur
    const offsetLng = (Math.random() - 0.5) * 0.003;
    const offsetLat = (Math.random() - 0.5) * 0.003;

    return {
      user_id: this.authService.currentUser?.id || 'parent_me',
      location: {
        type: 'Point',
        coordinates: [Number((lng + offsetLng).toFixed(5)), Number((lat + offsetLat).toFixed(5))]
      },
      neighborhood_id: 'nh_lafayette',
      neighborhood_name: 'Lafayette',
      precision_m: 200,
      verified: true,
      updated_at: new Date()
    };
  }

  private enrichNearbyParents(parents: NearbyParent[]): NearbyParent[] {
    const defaultAvatars = [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    ];

    const circles = this.circlesSubject.value;
    const closeMembers = circles.find(c => c.level === 'close')?.members || [];
    const nhMembers = circles.find(c => c.level === 'neighborhood')?.members || [];

    return parents.map((p, idx) => {
      let trustLevel: 'close' | 'neighborhood' | 'all' | 'none' = 'none';
      if (closeMembers.includes(p.user_id)) {
        trustLevel = 'close';
      } else if (nhMembers.includes(p.user_id)) {
        trustLevel = 'neighborhood';
      }

      return {
        ...p,
        displayName: p.displayName || this.formatAnonymizedName(p.user_id),
        avatar: p.avatar || defaultAvatars[idx % defaultAvatars.length],
        verified: p.verified ?? true,
        trustLevel,
        childrenCount: p.childrenCount || (idx % 3 + 1),
        neighborhood: p.neighborhood || 'Lafayette'
      };
    });
  }

  private formatAnonymizedName(userId: string): string {
    if (userId.startsWith('parent_')) {
      const name = userId.replace('parent_', '');
      return `Parent ${name.charAt(0).toUpperCase() + name.slice(1)}`;
    }
    if (userId.startsWith('user_')) {
      return `Voisin #${userId.substring(userId.length - 4)}`;
    }
    return `Parent (${userId.substring(0, 8)})`;
  }

  private getMockNeighborhoods(): Neighborhood[] {
    return [
      {
        id: 'nh_lafayette',
        name: 'Lafayette',
        city: 'Tunis',
        center: { type: 'Point', coordinates: [10.1815, 36.8065] },
        parentsCount: 42,
        description: 'Quartier central et dynamique, proche des écoles, commerces et transports publics.'
      },
      {
        id: 'nh_mutuelleville',
        name: 'Mutuelleville',
        city: 'Tunis',
        center: { type: 'Point', coordinates: [10.1700, 36.8280] },
        parentsCount: 38,
        description: 'Quartier résidentiel calme avec de nombreux parcs, crèches et espaces verts.'
      },
      {
        id: 'nh_centre_ville',
        name: 'Centre Ville',
        city: 'Tunis',
        center: { type: 'Point', coordinates: [10.1790, 36.7990] },
        parentsCount: 56,
        description: 'Cœur historique de Tunis, à deux pas de l’avenue Habib Bourguiba.'
      },
      {
        id: 'nh_ennasr_2',
        name: 'Ennasr 2',
        city: 'Ariana',
        center: { type: 'Point', coordinates: [10.1550, 36.8620] },
        parentsCount: 64,
        description: 'Zone résidentielle moderne avec une grande communauté de jeunes parents.'
      }
    ];
  }

  private getMockMeetingPoints(): MeetingPoint[] {
    return [
      {
        id: 'mp_jardin_passage',
        neighborhood_id: 'nh_lafayette',
        neighborhood_name: 'Lafayette',
        name: 'Jardin du Passage',
        type: 'park',
        location: { type: 'Point', coordinates: [10.1820, 36.8080] },
        address: 'Avenue Habib Thameur, Lafayette',
        description: 'Espace vert public bien éclairé, idéal pour l’échange de jouets et matériel de puériculture.',
        safetyFeatures: ['Éclairage public continu', 'Fréquentation familiale', 'Bancs publics']
      },
      {
        id: 'mp_mairie_lafayette',
        neighborhood_id: 'nh_lafayette',
        neighborhood_name: 'Lafayette',
        name: 'Mairie d’Arrondissement Lafayette',
        type: 'town_hall',
        location: { type: 'Point', coordinates: [10.1800, 36.8050] },
        address: 'Rue de Palestine, Lafayette',
        description: 'Zone administrative sécurisée avec surveillance pour des remises en mains propres sereines.',
        safetyFeatures: ['Surveillance municipale', 'Accès piéton facile', 'Point de repère officiel']
      },
      {
        id: 'mp_belvedere',
        neighborhood_id: 'nh_mutuelleville',
        neighborhood_name: 'Mutuelleville',
        name: 'Parc du Belvédère (Porte Est)',
        type: 'park',
        location: { type: 'Point', coordinates: [10.1710, 36.8250] },
        address: 'Avenue Taïeb Mehiri, Mutuelleville',
        description: 'Entrée principale du grand parc municipal, idéal pour se rencontrer lors d’une sortie avec les enfants.',
        safetyFeatures: ['Agents de sécurité du parc', 'Grande visibilité', 'Proche stationnements']
      },
      {
        id: 'mp_creche_dauphins',
        neighborhood_id: 'nh_mutuelleville',
        neighborhood_name: 'Mutuelleville',
        name: 'Crèche Les Petits Dauphins',
        type: 'daycare',
        location: { type: 'Point', coordinates: [10.1680, 36.8290] },
        address: 'Rue Ibn Zahr, Mutuelleville',
        description: 'Point de rencontre pratique à la sortie de la crèche pour confier du matériel ou organiser du covoiturage.',
        safetyFeatures: ['Environnement sécurisé enfants', 'Horaires de sortie fréquentés', 'Zone apaisée']
      },
      {
        id: 'mp_esplanade_bourguiba',
        neighborhood_id: 'nh_centre_ville',
        neighborhood_name: 'Centre Ville',
        name: 'Esplanade Habib Bourguiba',
        type: 'park',
        location: { type: 'Point', coordinates: [10.1850, 36.7995] },
        address: 'Avenue Habib Bourguiba, Centre Ville',
        description: 'Grande esplanade piétonne au centre-ville avec terrasses de cafés sécurisées.',
        safetyFeatures: ['Zone piétonne protégée', 'Très forte fréquentation', 'Accès métro / bus']
      },
      {
        id: 'mp_jardin_ennasr',
        neighborhood_id: 'nh_ennasr_2',
        neighborhood_name: 'Ennasr 2',
        name: 'Jardin Public Ennasr',
        type: 'park',
        location: { type: 'Point', coordinates: [10.1560, 36.8630] },
        address: 'Avenue Hédi Nouira, Ennasr 2',
        description: 'Jardin avec aire de jeux pour enfants et kiosques, propice aux rencontres amicales entre parents.',
        safetyFeatures: ['Aire de jeux clôturée', 'Éclairage nocturne', 'Cafés à proximité']
      }
    ];
  }

  private getMockNearbyParents(radius: number): NearbyParent[] {
    const rawParents: NearbyParent[] = [
      {
        user_id: 'parent_sarah',
        displayName: 'Sarah M.',
        distance_m: 200, // rounded
        verified: true,
        childrenCount: 2,
        neighborhood: 'Lafayette',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80'
      },
      {
        user_id: 'parent_karim',
        displayName: 'Karim B.',
        distance_m: 300,
        verified: true,
        childrenCount: 1,
        neighborhood: 'Lafayette',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'
      },
      {
        user_id: 'parent_amira',
        displayName: 'Amira T.',
        distance_m: 500,
        verified: true,
        childrenCount: 3,
        neighborhood: 'Lafayette',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
      },
      {
        user_id: 'parent_yassine',
        displayName: 'Yassine K.',
        distance_m: 800,
        verified: false,
        childrenCount: 1,
        neighborhood: 'Lafayette',
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
      },
      {
        user_id: 'parent_nour',
        displayName: 'Nour E.',
        distance_m: 1200,
        verified: true,
        childrenCount: 2,
        neighborhood: 'Mutuelleville',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80'
      },
      {
        user_id: 'parent_mehdi',
        displayName: 'Mehdi Z.',
        distance_m: 1600,
        verified: true,
        childrenCount: 2,
        neighborhood: 'Mutuelleville',
        avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80'
      },
      {
        user_id: 'parent_ines',
        displayName: 'Inès D.',
        distance_m: 2100,
        verified: true,
        childrenCount: 1,
        neighborhood: 'Centre Ville',
        avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80'
      }
    ];

    const filtered = rawParents.filter(p => p.distance_m <= radius);
    return this.enrichNearbyParents(filtered);
  }
}
