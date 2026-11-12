import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

// ---------------------------------------------------------------------------
// Module Babysitting — entraide de garde entre parents, payée en crédits-temps (1 h gardée = 1 crédit).
// API (FastAPI, via la Gateway, préfixe /api/babysitting) :
//   GET/POST /requests (?status=OPEN | ?mine=true) · PUT/DELETE /requests/{id} (auteur ou ADMIN)
//   POST /requests/{id}/accept {availability_id}   (BABYSITTER)
//   GET /availability/search?neighborhood=&date=     (recherche de babysitters disponibles)
//   GET /matches?request_id=   (parents disponibles compatibles, avec score)
//   GET/POST/DELETE /availability (créneaux de disponibilité de l'utilisateur)
//   GET /bookings · PATCH /bookings/{id}/confirm | cancel | complete
//   POST /ratings {booking_id, score, comment} · GET /credits
// Rôles : un PARENT publie des demandes ; un BABYSITTER publie ses disponibilités et accepte les demandes ;
// l'ADMIN modère. Seul le nom affiché (issu du compte) est conservé, jamais le nom des enfants.
// ---------------------------------------------------------------------------

export type SittingRequestStatus = 'OPEN' | 'MATCHED' | 'BOOKED' | 'CANCELLED' | 'COMPLETED';
export type BookingStatus = 'PENDING' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';

export interface SittingRequest {
  id: string;
  requesterId: string;
  date: string;          // yyyy-MM-dd
  startTime: string;     // HH:mm
  endTime: string;
  hours: number;
  neighborhood: string;
  numChildren: number;
  childAgeRanges: string[];
  notes: string | null;
  status: SittingRequestStatus;
  createdAt: Date;
  isMine: boolean;
  /** Nom affiché du parent auteur (null pour les demandes antérieures) */
  requesterName: string | null;
}

export interface SittingBooking {
  id: string;
  requestId: string;
  requesterId: string;
  babysitterId: string;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  status: BookingStatus;
  hoursCredited: number | null;
  /** Rôle de l'utilisateur connecté dans cette garde */
  role: 'REQUESTER' | 'BABYSITTER';
}

export interface AvailabilitySlot {
  id: string;
  isRecurring: boolean;
  dayOfWeek: number | null;   // 0 = lundi ... 6 = dimanche
  date: string | null;
  startTime: string;
  endTime: string;
  neighborhood: string;
  isActive: boolean;
  /** Propriétaire du créneau (recherche de babysitters) */
  userId?: string;
  userName?: string | null;
}

export interface CreditTransaction {
  amount: number;
  type: 'EARN' | 'SPEND' | 'ADJUSTMENT';
  description: string;
  balanceAfter: number;
  createdAt: Date;
}

export interface CreditAccount {
  balance: number;
  transactions: CreditTransaction[];
}

export interface SitterMatch {
  availabilityId: string;
  babysitterId: string;
  score: number;
  neighborhood: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface NewRequest {
  date: string;
  startTime: string;
  endTime: string;
  neighborhood: string;
  childAgeRanges: string[];
  notes?: string;
}

export interface NewAvailability {
  isRecurring: boolean;
  dayOfWeek?: number | null;
  date?: string | null;
  startTime: string;
  endTime: string;
  neighborhood: string;
}

export const WEEK_DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const AGE_RANGES = ['0-1', '1-3', '3-6', '6-10', '10-14'];

/** Traduction des erreurs métier du service (codes error_code). */
const ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_CREDITS: 'Solde d\'heures insuffisant pour clôturer cette garde.',
  DOUBLE_BOOKING: 'Vous avez déjà une garde sur ce créneau.',
  INVALID_STATE_TRANSITION: 'Cette action n\'est plus possible pour cette garde.',
  RATE_LIMITED: 'Trop de demandes en peu de temps, réessayez plus tard.',
};

@Injectable({ providedIn: 'root' })
export class BabysittingService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/api/babysitting`;

  private get userId(): string | undefined {
    return this.auth.currentUser?.id;
  }

  // ------------------------------------------------------------- demandes
  getOpenRequests(neighborhood?: string, date?: string): Observable<SittingRequest[]> {
    let params = new HttpParams().set('status', 'OPEN').set('page_size', 100);
    if (neighborhood?.trim()) params = params.set('neighborhood', neighborhood.trim());
    if (date) params = params.set('date', date);
    return this.http.get<{ items: any[] }>(`${this.base}/requests`, { params })
      .pipe(map(res => res.items.map(r => this.toRequest(r))));
  }

  getMyRequests(): Observable<SittingRequest[]> {
    const params = new HttpParams().set('mine', true).set('page_size', 100);
    return this.http.get<{ items: any[] }>(`${this.base}/requests`, { params })
      .pipe(map(res => res.items.map(r => this.toRequest(r))));
  }

  createRequest(req: NewRequest): Observable<SittingRequest> {
    const body = {
      date: req.date,
      start_time: req.startTime,
      end_time: req.endTime,
      neighborhood: req.neighborhood.trim(),
      num_children: req.childAgeRanges.length,
      child_age_ranges: req.childAgeRanges,
      notes: req.notes?.trim() || null,
    };
    return this.http.post<any>(`${this.base}/requests`, body).pipe(map(r => this.toRequest(r)));
  }

  updateRequest(id: string, req: NewRequest): Observable<SittingRequest> {
    const body = {
      date: req.date,
      start_time: req.startTime,
      end_time: req.endTime,
      neighborhood: req.neighborhood.trim(),
      num_children: req.childAgeRanges.length,
      child_age_ranges: req.childAgeRanges,
      notes: req.notes?.trim() || null,
    };
    return this.http.put<any>(`${this.base}/requests/${id}`, body).pipe(map(r => this.toRequest(r)));
  }

  getRequest(id: string): Observable<SittingRequest> {
    return this.http.get<any>(`${this.base}/requests/${id}`).pipe(map(r => this.toRequest(r)));
  }

  deleteRequest(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/requests/${id}`);
  }

  /** Babysitters disponibles (créneaux actifs des autres utilisateurs). */
  searchSitters(neighborhood?: string, date?: string): Observable<AvailabilitySlot[]> {
    let params = new HttpParams();
    if (neighborhood?.trim()) params = params.set('neighborhood', neighborhood.trim());
    if (date) params = params.set('date', date);
    return this.http.get<{ items: any[] }>(`${this.base}/availability/search`, { params })
      .pipe(map(res => res.items.map(a => this.toSlot(a))));
  }

  getMatches(requestId: string): Observable<SitterMatch[]> {
    const params = new HttpParams().set('request_id', requestId);
    return this.http.get<{ matches: any[] }>(`${this.base}/matches`, { params }).pipe(
      map(res => res.matches.map(m => ({
        availabilityId: m.availability_id,
        babysitterId: m.babysitter_id,
        score: Math.round(m.score),
        neighborhood: m.neighborhood,
        date: m.scheduled_date,
        startTime: String(m.start_time).substring(0, 5),
        endTime: String(m.end_time).substring(0, 5),
      }))),
    );
  }

  /**
   * « Je peux garder » : utilise un de mes créneaux qui couvre la demande, sinon crée un créneau ponctuel
   * correspondant, puis accepte la demande (une garde en attente de confirmation est créée).
   */
  offerToSit(request: SittingRequest): Observable<SittingBooking> {
    return this.getMyAvailability().pipe(
      switchMap(slots => {
        const covering = slots.find(s => this.covers(s, request));
        return covering
          ? of(covering)
          : this.createAvailability({
              isRecurring: false, date: request.date, startTime: request.startTime,
              endTime: request.endTime, neighborhood: request.neighborhood,
            });
      }),
      switchMap(slot => this.http.post<any>(`${this.base}/requests/${request.id}/accept`, { availability_id: slot.id })),
      map(b => this.toBooking(b)),
    );
  }

  // ------------------------------------------------------- disponibilités
  getMyAvailability(): Observable<AvailabilitySlot[]> {
    return this.http.get<{ items: any[] }>(`${this.base}/availability`).pipe(
      map(res => res.items.map(a => this.toSlot(a))),
    );
  }

  createAvailability(slot: NewAvailability): Observable<AvailabilitySlot> {
    const body = {
      is_recurring: slot.isRecurring,
      day_of_week: slot.isRecurring ? slot.dayOfWeek : null,
      date: slot.isRecurring ? null : slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
      neighborhood: slot.neighborhood.trim(),
    };
    return this.http.post<any>(`${this.base}/availability`, body).pipe(map(a => this.toSlot(a)));
  }

  deleteAvailability(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/availability/${id}`);
  }

  // --------------------------------------------------------------- gardes
  getMyBookings(): Observable<SittingBooking[]> {
    return this.http.get<{ items: any[] }>(`${this.base}/bookings`).pipe(
      map(res => res.items.map(b => this.toBooking(b))
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))),
    );
  }

  confirmBooking(id: string): Observable<SittingBooking> {
    return this.http.patch<any>(`${this.base}/bookings/${id}/confirm`, {}).pipe(map(b => this.toBooking(b)));
  }

  cancelBooking(id: string): Observable<SittingBooking> {
    return this.http.patch<any>(`${this.base}/bookings/${id}/cancel`, {}).pipe(map(b => this.toBooking(b)));
  }

  completeBooking(id: string): Observable<SittingBooking> {
    return this.http.patch<any>(`${this.base}/bookings/${id}/complete`, {}).pipe(map(b => this.toBooking(b)));
  }

  rateBooking(bookingId: string, score: number, comment?: string): Observable<void> {
    return this.http.post(`${this.base}/ratings`, { booking_id: bookingId, score, comment: comment?.trim() || null })
      .pipe(map(() => undefined));
  }

  // -------------------------------------------------------------- crédits
  getCredits(): Observable<CreditAccount> {
    return this.http.get<any>(`${this.base}/credits`).pipe(
      map(res => ({
        balance: Number(res.balance),
        transactions: (res.transactions ?? []).map((t: any) => ({
          amount: Number(t.amount),
          type: t.transaction_type,
          description: t.description,
          balanceAfter: Number(t.balance_after),
          createdAt: new Date(t.created_at),
        })),
      })),
    );
  }

  // ----------------------------------------------------------- utilitaires
  errorMessage(err: unknown, fallback: string): string {
    const http = err as HttpErrorResponse;
    const body = http?.error;
    if (body?.error_code && ERROR_MESSAGES[body.error_code]) return ERROR_MESSAGES[body.error_code];
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return `Données invalides : ${body.detail[0].msg}`;
    if (typeof body?.detail === 'string' && body.detail.trim()) return body.detail;
    if (http?.status === 0) return 'Service indisponible. Vérifiez que la plateforme est démarrée.';
    if (http?.status === 403) return 'Action non autorisée pour votre rôle.';
    return fallback;
  }

  slotLabel(slot: AvailabilitySlot): string {
    const when = slot.isRecurring
      ? `Chaque ${WEEK_DAYS[slot.dayOfWeek ?? 0].toLowerCase()}`
      : new Date(`${slot.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return `${when} · ${slot.startTime}-${slot.endTime} · ${slot.neighborhood}`;
  }

  private covers(slot: AvailabilitySlot, req: SittingRequest): boolean {
    if (!slot.isActive || slot.startTime > req.startTime || slot.endTime < req.endTime) return false;
    if (slot.isRecurring) {
      const weekday = (new Date(`${req.date}T00:00:00`).getDay() + 6) % 7; // JS : 0 = dimanche -> 0 = lundi
      return slot.dayOfWeek === weekday;
    }
    return slot.date === req.date;
  }

  private toSlot(a: any): AvailabilitySlot {
    return {
      id: a.id, isRecurring: a.is_recurring, dayOfWeek: a.day_of_week, date: a.date,
      startTime: String(a.start_time).substring(0, 5), endTime: String(a.end_time).substring(0, 5),
      neighborhood: a.neighborhood, isActive: a.is_active, userId: a.user_id, userName: a.user_name ?? null,
    };
  }

  private hoursBetween(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
  }

  private toRequest(r: any): SittingRequest {
    const startTime = String(r.start_time).substring(0, 5);
    const endTime = String(r.end_time).substring(0, 5);
    return {
      id: r.id,
      requesterId: r.requester_id,
      date: r.date,
      startTime,
      endTime,
      hours: this.hoursBetween(startTime, endTime),
      neighborhood: r.neighborhood,
      numChildren: r.num_children,
      childAgeRanges: r.child_age_ranges ?? [],
      notes: r.notes,
      status: r.status,
      createdAt: new Date(r.created_at),
      isMine: r.requester_id === this.userId,
      requesterName: r.requester_name ?? null,
    };
  }

  private toBooking(b: any): SittingBooking {
    const startTime = String(b.start_time).substring(0, 5);
    const endTime = String(b.end_time).substring(0, 5);
    return {
      id: b.id,
      requestId: b.request_id,
      requesterId: b.requester_id,
      babysitterId: b.babysitter_id,
      date: b.scheduled_date,
      startTime,
      endTime,
      hours: this.hoursBetween(startTime, endTime),
      status: b.status,
      hoursCredited: b.hours_credited === null || b.hours_credited === undefined ? null : Number(b.hours_credited),
      role: b.requester_id === this.userId ? 'REQUESTER' : 'BABYSITTER',
    };
  }
}
