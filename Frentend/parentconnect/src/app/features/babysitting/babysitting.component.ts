import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AvailabilitySlot, BabysittingService, CreditAccount, SittingRequest } from './services/babysitting.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';

/**
 * Onglets selon le rôle :
 *  - PARENT     : « Mes demandes » (modifier / supprimer) et « Trouver un babysitter » (recherche de disponibilités)
 *  - BABYSITTER : « Demandes à pourvoir » (bouton « Je peux garder »)
 *  - ADMIN      : toutes les demandes ouvertes, avec modération (modifier / supprimer)
 */
type Tab = 'OPEN' | 'MINE' | 'SITTERS';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-babysitting',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './babysitting.component.html',
  styleUrls: ['./babysitting.component.scss']
})
export class BabysittingComponent implements OnInit {
  requests: SittingRequest[] = [];
  sitters: AvailabilitySlot[] = [];
  credits: CreditAccount | null = null;
  loading = true;
  loadError = false;
  neighborhoodFilter = '';
  dateFilter = '';
  tab: Tab = 'OPEN';
  pendingOfferId: string | null = null;
  busyId: string | null = null;

  readonly isAdmin: boolean;
  readonly isSitter: boolean;
  readonly isParent: boolean;

  constructor(
    private babysittingService: BabysittingService,
    private auth: AuthService,
    private router: Router,
    private toast: ToastService
  ) {
    this.isAdmin = auth.hasRole('ADMIN');
    this.isSitter = auth.hasRole('BABYSITTER') || auth.hasRole('PROFESSIONAL');
    // Un compte sans rôle métier explicite est traité comme un parent (comportement historique)
    this.isParent = auth.hasRole('PARENT') || (!this.isSitter && !this.isAdmin);
    this.tab = this.isSitter || this.isAdmin ? 'OPEN' : 'MINE';
  }

  ngOnInit(): void {
    this.load();
  }

  get canRequest(): boolean {
    return this.isParent || this.isAdmin;
  }

  get canOffer(): boolean {
    return this.isSitter || this.isAdmin;
  }

  load(): void {
    this.loading = true;
    this.loadError = false;
    if (this.tab === 'SITTERS') {
      this.babysittingService.searchSitters(this.neighborhoodFilter, this.dateFilter || undefined).subscribe({
        next: slots => {
          this.sitters = slots;
          this.loading = false;
        },
        error: err => this.fail(err, 'Impossible de rechercher des babysitters.')
      });
      return;
    }
    forkJoin({
      requests: this.babysittingService.getOpenRequests(this.neighborhoodFilter, this.dateFilter || undefined),
      credits: this.babysittingService.getCredits().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ requests, credits }) => {
        this.requests = requests;
        this.credits = credits;
        this.loading = false;
      },
      error: err => this.fail(err, 'Impossible de charger les demandes de garde.')
    });
  }

  private fail(err: unknown, fallback: string): void {
    this.loading = false;
    this.loadError = true;
    this.toast.error(this.babysittingService.errorMessage(err, fallback));
  }

  selectTab(tab: Tab): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.load();
  }

  get visibleRequests(): SittingRequest[] {
    if (this.tab === 'MINE') return this.requests.filter(r => r.isMine);
    // Demandes à pourvoir : celles des autres (l'admin voit tout pour modérer)
    return this.isAdmin ? this.requests : this.requests.filter(r => !r.isMine);
  }

  get myOpenCount(): number {
    return this.requests.filter(r => r.isMine).length;
  }

  canManage(r: SittingRequest): boolean {
    return r.isMine || this.isAdmin;
  }

  resetFilters(): void {
    this.neighborhoodFilter = '';
    this.dateFilter = '';
    this.load();
  }

  offer(request: SittingRequest): void {
    if (this.pendingOfferId) return;
    const label = `${this.formatDate(request.date)} de ${request.startTime} à ${request.endTime}`;
    if (!window.confirm(`Proposer de garder ${request.numChildren} enfant(s) ${label} à ${request.neighborhood} ?`)) return;
    this.pendingOfferId = request.id;
    this.babysittingService.offerToSit(request).subscribe({
      next: () => {
        this.pendingOfferId = null;
        this.requests = this.requests.filter(r => r.id !== request.id);
        this.toast.success('Proposition envoyée ! Le parent doit confirmer la garde (onglet « Mes gardes »).');
      },
      error: err => {
        this.pendingOfferId = null;
        this.toast.error(this.babysittingService.errorMessage(err, 'Impossible de proposer cette garde.'));
      }
    });
  }

  edit(request: SittingRequest): void {
    this.router.navigate(['/app/babysitting/edit', request.id]);
  }

  remove(request: SittingRequest): void {
    const label = `${this.formatDate(request.date)} (${request.startTime}-${request.endTime}, ${request.neighborhood})`;
    if (!window.confirm(`Supprimer définitivement la demande du ${label} ?`)) return;
    this.busyId = request.id;
    this.babysittingService.deleteRequest(request.id).subscribe({
      next: () => {
        this.busyId = null;
        this.requests = this.requests.filter(r => r.id !== request.id);
        this.toast.success('Demande supprimée.');
      },
      error: err => {
        this.busyId = null;
        this.toast.error(this.babysittingService.errorMessage(err, 'Suppression impossible.'));
      }
    });
  }

  contact(slot: AvailabilitySlot): void {
    if (!slot.userId) return;
    this.router.navigate(['/app/messages'], {
      queryParams: {
        recipient: slot.userId,
        babysitting: slot.id,
        title: `Garde · ${slot.neighborhood}`,
      }
    });
  }

  slotLabel(slot: AvailabilitySlot): string {
    return this.babysittingService.slotLabel(slot);
  }

  formatDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  dayNumber(date: string): string {
    return date.substring(8, 10);
  }

  monthLabel(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').toUpperCase();
  }

  initials(name: string | null | undefined): string {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  }
}
