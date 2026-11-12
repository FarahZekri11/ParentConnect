import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  AvailabilitySlot, BabysittingService, CreditAccount, SittingBooking, SittingRequest, WEEK_DAYS
} from '../../services/babysitting.service';
import { ToastService } from '../../../../shared/services/toast.service';

type Tab = 'BOOKINGS' | 'REQUESTS' | 'AVAILABILITY' | 'CREDITS';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './my-bookings.component.html',
  styleUrls: ['./my-bookings.component.scss']
})
export class MyBookingsComponent implements OnInit {
  tab: Tab = 'BOOKINGS';
  loading = true;
  bookings: SittingBooking[] = [];
  requests: SittingRequest[] = [];
  slots: AvailabilitySlot[] = [];
  credits: CreditAccount | null = null;
  busyId: string | null = null;
  readonly weekDays = WEEK_DAYS;

  /** Garde en cours de notation */
  ratingBooking: SittingBooking | null = null;
  ratingScore = 5;
  ratingComment = '';
  /** Gardes déjà notées (mémorisées dans le navigateur ; le service refuse une 2e note) */
  rated = new Set<string>(this.readRated());

  /** Nouveau créneau de disponibilité */
  newSlot = { isRecurring: true, dayOfWeek: 2, date: '', startTime: '17:00', endTime: '20:00', neighborhood: '' };

  readonly isSitter: boolean;
  readonly isAdmin: boolean;

  constructor(
    private babysittingService: BabysittingService,
    private toast: ToastService,
    private router: Router,
    auth: AuthService
  ) {
    this.isAdmin = auth.hasRole('ADMIN');
    this.isSitter = auth.hasRole('BABYSITTER') || auth.hasRole('PROFESSIONAL');
  }

  /** Un parent publie des demandes ; un babysitter publie des disponibilités (l'admin voit les deux). */
  get showRequests(): boolean {
    return !this.isSitter || this.isAdmin;
  }

  get showAvailability(): boolean {
    return this.isSitter || this.isAdmin;
  }

  ngOnInit(): void {
    this.load();
  }

  editRequest(r: SittingRequest): void {
    this.router.navigate(['/app/babysitting/edit', r.id]);
  }

  deleteRequest(r: SittingRequest): void {
    if (!window.confirm(`Supprimer définitivement la demande du ${this.formatDate(r.date)} (${r.startTime}-${r.endTime}) ?`)) return;
    this.busyId = r.id;
    this.babysittingService.deleteRequest(r.id).subscribe({
      next: () => {
        this.busyId = null;
        this.requests = this.requests.filter(x => x.id !== r.id);
        this.toast.success('Demande supprimée.');
      },
      error: err => {
        this.busyId = null;
        this.toast.error(this.babysittingService.errorMessage(err, 'Suppression impossible.'));
      }
    });
  }

  load(): void {
    this.loading = true;
    const safe = <T>(obs: Observable<T>, fallback: T) => obs.pipe(catchError(() => of(fallback)));
    forkJoin({
      bookings: safe(this.babysittingService.getMyBookings(), [] as SittingBooking[]),
      requests: this.showRequests ? safe(this.babysittingService.getMyRequests(), [] as SittingRequest[]) : of([] as SittingRequest[]),
      slots: this.showAvailability ? safe(this.babysittingService.getMyAvailability(), [] as AvailabilitySlot[]) : of([] as AvailabilitySlot[]),
      credits: safe(this.babysittingService.getCredits(), null as CreditAccount | null),
    }).subscribe(res => {
      this.bookings = res.bookings;
      this.requests = res.requests;
      this.slots = res.slots;
      this.credits = res.credits;
      this.loading = false;
    });
  }

  get activeBookings(): SittingBooking[] {
    return this.bookings.filter(b => b.status === 'PENDING' || b.status === 'ACCEPTED');
  }

  get pastBookings(): SittingBooking[] {
    return this.bookings.filter(b => b.status === 'COMPLETED' || b.status === 'CANCELLED');
  }

  // --------------------------------------------------------------- gardes
  confirm(b: SittingBooking): void {
    this.run(b.id, this.babysittingService.confirmBooking(b.id), 'Garde confirmée ! Échangez les détails par la messagerie.');
  }

  cancel(b: SittingBooking): void {
    if (!window.confirm('Annuler cette garde ? La demande redeviendra visible par les babysitters.')) return;
    this.run(b.id, this.babysittingService.cancelBooking(b.id), 'Garde annulée.');
  }

  complete(b: SittingBooking): void {
    if (!window.confirm(`Marquer la garde comme terminée ? ${b.hours} heure(s) seront comptabilisées.`)) return;
    this.run(b.id, this.babysittingService.completeBooking(b.id), 'Garde terminée : les crédits ont été transférés.');
  }

  openRating(b: SittingBooking): void {
    this.ratingBooking = b;
    this.ratingScore = 5;
    this.ratingComment = '';
  }

  submitRating(): void {
    const b = this.ratingBooking;
    if (!b) return;
    this.busyId = b.id;
    this.babysittingService.rateBooking(b.id, this.ratingScore, this.ratingComment).subscribe({
      next: () => {
        this.busyId = null;
        this.markRated(b.id);
        this.ratingBooking = null;
        this.toast.success('Merci pour votre avis !');
      },
      error: err => {
        this.busyId = null;
        if (err?.status === 409) {
          // Déjà notée (par exemple depuis un autre navigateur)
          this.markRated(b.id);
          this.ratingBooking = null;
          this.toast.info('Vous avez déjà noté cette garde.');
          return;
        }
        this.toast.error(this.babysittingService.errorMessage(err, 'Impossible d\'enregistrer la note.'));
      }
    });
  }

  private markRated(id: string): void {
    this.rated.add(id);
    try {
      localStorage.setItem('pc_babysitting_rated', JSON.stringify([...this.rated]));
    } catch {
      // stockage indisponible : sans conséquence
    }
  }

  private readRated(): string[] {
    try {
      return JSON.parse(localStorage.getItem('pc_babysitting_rated') || '[]');
    } catch {
      return [];
    }
  }

  private run(id: string, action: Observable<unknown>, success: string): void {
    this.busyId = id;
    action.subscribe({
      next: () => {
        this.busyId = null;
        this.toast.success(success);
        this.load();
      },
      error: err => {
        this.busyId = null;
        this.toast.error(this.babysittingService.errorMessage(err, 'Action impossible.'));
      }
    });
  }

  // ------------------------------------------------------- disponibilités
  addSlot(): void {
    const s = this.newSlot;
    if (!s.neighborhood.trim() || s.endTime <= s.startTime || (!s.isRecurring && !s.date)) {
      this.toast.warning('Indiquez le quartier, le jour (ou la date) et des horaires valides.');
      return;
    }
    this.babysittingService.createAvailability({ ...s, dayOfWeek: Number(s.dayOfWeek) }).subscribe({
      next: slot => {
        this.slots = [...this.slots, slot];
        this.toast.success('Disponibilité ajoutée : vous apparaîtrez dans les propositions des parents.');
      },
      error: err => this.toast.error(this.babysittingService.errorMessage(err, 'Impossible d\'ajouter la disponibilité.'))
    });
  }

  removeSlot(slot: AvailabilitySlot): void {
    this.babysittingService.deleteAvailability(slot.id).subscribe({
      next: () => {
        this.slots = this.slots.filter(s => s.id !== slot.id);
        this.toast.info('Disponibilité supprimée.');
      },
      error: err => this.toast.error(this.babysittingService.errorMessage(err, 'Suppression impossible.'))
    });
  }

  // ------------------------------------------------------------ affichage
  slotLabel(slot: AvailabilitySlot): string {
    return this.babysittingService.slotLabel(slot);
  }

  formatDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'À confirmer', ACCEPTED: 'Confirmée', COMPLETED: 'Terminée', CANCELLED: 'Annulée',
      OPEN: 'En attente d\'un parent', MATCHED: 'Parent trouvé', BOOKED: 'Garde prévue',
    };
    return labels[status] ?? status;
  }

  statusClass(status: string): string {
    return `status-${status.toLowerCase()}`;
  }
}
