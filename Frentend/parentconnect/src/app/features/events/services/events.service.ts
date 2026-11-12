import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { GeocodedPlace, GeocodingService } from '../../../core/services/geocoding.service';
import { Event, EventCategory, EventParticipant, EventStatus } from '../../../shared/models';

// ---------------------------------------------------------------------------
// Contrat de l'API (via l'API Gateway) : event-service + participation-service
//   GET    /api/events                    liste (filtres : category, dateFrom, dateTo, q, status...)
//   GET    /api/events/{id}               détail
//   POST   /api/events                    création (ADMIN)
//   PUT    /api/events/{id}               modification (organisateur / ADMIN)
//   DELETE /api/events/{id}               annulation (organisateur / ADMIN)
//   POST   /api/events/{id}/join          inscription (PARENT) — corps : { childrenCount, note }
//   DELETE /api/events/{id}/leave         désinscription (PARENT)
//   GET    /api/events/{id}/participants  participants (organisateur / ADMIN)
//   GET    /api/events/me/joined          mes inscriptions (PARENT)
// ---------------------------------------------------------------------------

interface ApiEvent {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  startDateTime: string;
  endDateTime: string;
  locationName: string | null;
  address: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  reservedPlaces: number;
  availablePlaces: number;
  full: boolean;
  minChildAge: number | null;
  maxChildAge: number | null;
  organizerId: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

interface ApiPage<T> {
  content: T[];
  totalElements: number;
}

interface ApiParticipation {
  id: string;
  eventId: string;
  userId: string;
  status: 'CONFIRMED' | 'CANCELLED';
  childrenCount: number;
  note: string | null;
  joinedAt: string;
}

interface ApiParticipant {
  participationId: string;
  userId: string;
  participantName: string | null;
  childrenCount: number;
  note: string | null;
  joinedAt: string;
}

/** Valeurs du formulaire de création / modification (ADMIN). */
export interface EventFormValue {
  title: string;
  description: string;
  category: EventCategory;
  date: string;          // yyyy-MM-dd
  startTime: string;     // HH:mm
  endTime: string;       // HH:mm
  locationName: string;
  address: string;
  city: string;
  capacity: number;
  minChildAge: number | null;
  maxChildAge: number | null;
}

export interface JoinDetails {
  childrenCount: number;
  note?: string;
}

export type TimeFilter = 'ALL' | 'THIS_WEEK' | 'THIS_MONTH';

export interface CategoryInfo {
  key: EventCategory;
  label: string;
  desc: string;
  icon: string;
  image: string;
}

/** Illustration de couverture intégrée (dégradé + emoji), utilisable hors connexion. */
function cover(from: string, to: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/>`
    + `<stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/>`
    + `<circle cx="660" cy="80" r="120" fill="#ffffff" opacity="0.12"/><circle cx="120" cy="400" r="160" fill="#ffffff" opacity="0.10"/>`
    + `<text x="400" y="270" font-size="150" text-anchor="middle">${emoji}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export const EVENT_CATEGORIES: CategoryInfo[] = [
  { key: 'ATELIER', label: 'Atelier', desc: 'Motricité, éveil musical, bricolage, massage bébé...', icon: 'palette',
    image: cover('#f3b48b', '#c8553d', '🎨') },
  { key: 'SORTIE', label: 'Sortie & Balade', desc: 'Promenade au parc, sortie poussette, visite...', icon: 'directions_walk',
    image: cover('#a8d5a2', '#3f7d58', '🌳') },
  { key: 'RENCONTRE_PARENTS', label: 'Café Parents', desc: 'Discussions conviviales entre parents.', icon: 'local_cafe',
    image: cover('#f2d6a2', '#a0673a', '☕') },
  { key: 'JEUX', label: 'Jeux & Éveil', desc: 'Jeux libres et rendez-vous entre enfants.', icon: 'toys',
    image: cover('#b9c6f0', '#5b6bb5', '🧸') },
  { key: 'SPORT', label: 'Sport', desc: 'Baby gym, yoga parent-enfant, course...', icon: 'sports_handball',
    image: cover('#9fd9d3', '#2f8f88', '🤸') },
  { key: 'AUTRE', label: 'Autre', desc: 'Tout autre rendez-vous de quartier.', icon: 'event',
    image: cover('#e3c2e6', '#7b4a85', '📅') },
];

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly geocoding = inject(GeocodingService);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/events`;

  // ------------------------------------------------------------------ rôles
  private roles(): string[] {
    const user = this.auth.currentUser;
    const roles = (user?.roles ?? []).map(r => r.toUpperCase());
    if (user?.role === 'ADMIN' && !roles.includes('ADMIN')) roles.push('ADMIN');
    return roles;
  }

  /** Seuls les administrateurs créent, modifient et annulent des événements. */
  isAdmin(): boolean {
    return this.roles().includes('ADMIN');
  }

  /** Seuls les parents s'inscrivent aux événements. */
  isParent(): boolean {
    return this.roles().includes('PARENT') && !this.isAdmin();
  }

  // ------------------------------------------------------------- lecture
  getEvents(category?: string, timeFilter: TimeFilter = 'ALL', search?: string): Observable<Event[]> {
    let params = new HttpParams().set('size', 60).set('sort', 'startDateTime,asc');
    if (category && category !== 'ALL') params = params.set('category', category);
    if (search && search.trim()) params = params.set('q', search.trim());
    const range = this.dateRange(timeFilter);
    if (range) params = params.set('dateFrom', range.from).set('dateTo', range.to);

    return forkJoin({
      page: this.http.get<ApiPage<ApiEvent>>(this.baseUrl, { params }),
      joined: this.myParticipationsByEvent(),
    }).pipe(map(({ page, joined }) => page.content.map(e => this.toEvent(e, joined.get(e.id)))));
  }

  /** Détail ; undefined si l'événement n'existe pas. Les participants sont chargés pour l'ADMIN. */
  getEventById(id: string): Observable<Event | undefined> {
    return forkJoin({
      event: this.http.get<ApiEvent>(`${this.baseUrl}/${id}`),
      joined: this.myParticipationsByEvent(),
      participants: this.isAdmin() ? this.getParticipants(id) : of(undefined),
    }).pipe(
      map(({ event, joined, participants }) => {
        const evt = this.toEvent(event, joined.get(event.id));
        if (participants) evt.participants = participants;
        return evt;
      }),
      catchError((err: HttpErrorResponse) =>
        err.status === 404 || err.status === 400 ? of(undefined) : throwError(() => err)),
    );
  }

  getParticipants(eventId: string): Observable<EventParticipant[]> {
    const params = new HttpParams().set('size', 100).set('sort', 'joinedAt,asc');
    return this.http.get<ApiPage<ApiParticipant>>(`${this.baseUrl}/${eventId}/participants`, { params }).pipe(
      map(page => page.content.map(p => ({
        id: p.userId,
        name: p.participantName || 'Parent',
        joinedAt: new Date(p.joinedAt),
        childrenCount: p.childrenCount,
        note: p.note,
      }))),
      catchError(() => of([])),
    );
  }

  /** Événements auxquels le parent connecté est inscrit (statut CONFIRMED), indexés par événement. */
  private myParticipationsByEvent(): Observable<Map<string, ApiParticipation>> {
    if (!this.isParent()) return of(new Map());
    const params = new HttpParams().set('status', 'CONFIRMED').set('size', 100);
    return this.http.get<ApiPage<ApiParticipation>>(`${this.baseUrl}/me/joined`, { params }).pipe(
      map(page => new Map(page.content.map(p => [p.eventId, p] as [string, ApiParticipation]))),
      catchError(() => of(new Map<string, ApiParticipation>())),
    );
  }

  // ------------------------------------------------------- participation
  join(eventId: string, details: JoinDetails = { childrenCount: 1 }): Observable<Event | undefined> {
    const body = { childrenCount: details.childrenCount, note: details.note?.trim() || null };
    return this.http.post(`${this.baseUrl}/${eventId}/join`, body).pipe(switchMap(() => this.getEventById(eventId)));
  }

  leave(eventId: string): Observable<Event | undefined> {
    return this.http.delete(`${this.baseUrl}/${eventId}/leave`).pipe(switchMap(() => this.getEventById(eventId)));
  }

  /** Inscription rapide depuis la liste (1 enfant) ou désinscription. */
  toggleJoin(event: Event): Observable<Event | undefined> {
    return event.isJoined ? this.leave(event.id) : this.join(event.id);
  }

  // ------------------------------------------------------- administration
  /** L'adresse est géocodée (OpenStreetMap, ~100 m) pour placer l'événement sur la carte « Mon quartier ». */
  createEvent(form: EventFormValue): Observable<Event> {
    return this.locate(form).pipe(
      switchMap(place => this.http.post<ApiEvent>(this.baseUrl, this.toRequest(form, place))),
      map(e => this.toEvent(e)),
    );
  }

  updateEvent(id: string, form: EventFormValue): Observable<Event> {
    return this.locate(form).pipe(
      switchMap(place => this.http.put<ApiEvent>(`${this.baseUrl}/${id}`, this.toRequest(form, place))),
      map(e => this.toEvent(e)),
    );
  }

  /** Adresse puis ville seule ; null si introuvable (l'événement est alors enregistré sans coordonnées). */
  private locate(form: EventFormValue): Observable<GeocodedPlace | null> {
    const city = form.city?.trim();
    const full = [form.address, city].map(v => v?.trim()).filter(Boolean).join(', ');
    return this.geocoding.locate(full).pipe(
      switchMap(place => (place || !city || full === city ? of(place) : this.geocoding.locate(city))),
    );
  }

  cancelEvent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // ------------------------------------------------------------- utilitaires
  /** Message d'erreur lisible renvoyé par les services ({ message }), sinon message générique. */
  errorMessage(err: unknown, fallback: string): string {
    const http = err as HttpErrorResponse;
    const message = http?.error?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (http?.status === 0) return 'Service indisponible. Vérifiez que la plateforme est démarrée.';
    if (http?.status === 403) return 'Action non autorisée pour votre rôle.';
    return fallback;
  }

  categoryInfo(category?: string): CategoryInfo {
    return EVENT_CATEGORIES.find(c => c.key === category) ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
  }

  /** Valeurs du formulaire à partir d'un événement existant (modification). */
  toFormValue(event: Event): EventFormValue {
    const start = event.startDateTime ?? '';
    const end = event.endDateTime ?? '';
    return {
      title: event.title,
      description: event.description,
      category: event.category,
      date: start.substring(0, 10),
      startTime: start.substring(11, 16),
      endTime: end.substring(11, 16),
      locationName: event.locationName ?? '',
      address: event.streetAddress ?? '',
      city: event.city,
      capacity: event.maxParticipants ?? 10,
      minChildAge: event.minChildAge ?? null,
      maxChildAge: event.maxChildAge ?? null,
    };
  }

  private toRequest(form: EventFormValue, place: GeocodedPlace | null = null) {
    const blankToNull = (v: string) => (v && v.trim() ? v.trim() : null);
    const age = (v: number | null | string) => (v === null || v === '' || v === undefined ? null : Number(v));
    return {
      title: form.title.trim(),
      description: blankToNull(form.description),
      category: form.category,
      startDateTime: `${form.date}T${form.startTime}:00`,
      endDateTime: `${form.date}T${form.endTime}:00`,
      locationName: blankToNull(form.locationName),
      address: blankToNull(form.address),
      city: form.city.trim(),
      latitude: place?.lat ?? null,
      longitude: place?.lng ?? null,
      capacity: Number(form.capacity),
      minChildAge: age(form.minChildAge),
      maxChildAge: age(form.maxChildAge),
    };
  }

  private toEvent(api: ApiEvent, mine?: ApiParticipation): Event {
    const place = [api.locationName, api.address].filter(Boolean).join(' — ');
    return {
      id: api.id,
      organizerId: api.organizerId,
      organizerName: 'Équipe ParentConnect',
      title: api.title,
      description: api.description ?? '',
      category: api.category,
      imageUrl: this.categoryInfo(api.category).image,
      date: new Date(api.startDateTime),
      startTime: api.startDateTime.substring(11, 16),
      endTime: api.endDateTime?.substring(11, 16),
      address: place,
      city: api.city,
      maxParticipants: api.capacity,
      participantCount: api.reservedPlaces,
      isJoined: !!mine,
      isFree: true,
      createdAt: new Date(api.createdAt),
      status: api.status,
      startDateTime: api.startDateTime,
      endDateTime: api.endDateTime,
      locationName: api.locationName ?? undefined,
      streetAddress: api.address ?? undefined,
      availablePlaces: api.availablePlaces,
      minChildAge: api.minChildAge,
      maxChildAge: api.maxChildAge,
      myChildrenCount: mine?.childrenCount,
      myNote: mine?.note,
    };
  }

  /** Bornes (yyyy-MM-dd) : « cette semaine » = aujourd'hui → dimanche ; « ce mois-ci » = aujourd'hui → fin du mois. */
  private dateRange(filter: TimeFilter): { from: string; to: string } | null {
    if (filter === 'ALL') return null;
    const today = new Date();
    const end = new Date(today);
    if (filter === 'THIS_WEEK') {
      end.setDate(today.getDate() + ((7 - today.getDay()) % 7));
    } else {
      end.setMonth(today.getMonth() + 1, 0);
    }
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: fmt(today), to: fmt(end) };
  }
}
