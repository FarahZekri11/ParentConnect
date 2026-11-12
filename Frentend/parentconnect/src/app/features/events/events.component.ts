import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { EVENT_CATEGORIES, EventsService, TimeFilter } from './services/events.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Event, User } from '../../shared/models';

interface CategoryFilter {
  key: string;
  label: string;
  icon: string;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss']
})
export class EventsComponent implements OnInit, OnDestroy {
  events: Event[] = [];
  isLoading = true;
  loadError = false;
  selectedCategory = 'ALL';
  selectedTimeFilter: TimeFilter = 'ALL';
  searchQuery = '';
  onlyMine = false;
  currentUser: User | null = null;
  isAdmin = false;
  isParent = false;
  pendingJoinId: string | null = null;

  categories: CategoryFilter[] = [
    { key: 'ALL', label: 'Tous', icon: 'event' },
    ...EVENT_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: c.icon })),
  ];

  timeFilters: { key: TimeFilter; label: string }[] = [
    { key: 'ALL', label: 'Toutes dates' },
    { key: 'THIS_WEEK', label: 'Cette semaine' },
    { key: 'THIS_MONTH', label: 'Ce mois-ci' }
  ];

  /** Chaque changement de filtre passe par ce flux : une seule requête en cours (switchMap), recherche temporisée. */
  private readonly reload$ = new Subject<void>();
  private readonly search$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  constructor(
    private eventsService: EventsService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.authService.currentUser$.subscribe(u => {
      this.currentUser = u;
      this.isAdmin = this.eventsService.isAdmin();
      this.isParent = this.eventsService.isParent();
    }));

    this.subscriptions.add(this.reload$.pipe(
      tap(() => { this.isLoading = true; this.loadError = false; }),
      // L'erreur est traitée dans le flux interne : le flux principal reste actif pour les rechargements suivants
      switchMap(() => this.eventsService
        .getEvents(this.selectedCategory, this.selectedTimeFilter, this.searchQuery)
        .pipe(catchError(err => {
          this.loadError = true;
          this.toastService.error(this.eventsService.errorMessage(err, 'Erreur lors du chargement des événements.'));
          return of<Event[]>([]);
        })))
    ).subscribe(events => {
      this.events = events;
      this.isLoading = false;
    }));

    // Recherche : une requête 300 ms après la dernière frappe (au lieu d'une requête par caractère)
    this.subscriptions.add(this.search$.pipe(debounceTime(300), distinctUntilChanged())
      .subscribe(() => this.loadEvents()));

    this.loadEvents();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Événements affichés (filtre « Mes inscriptions » appliqué côté client). */
  get visibleEvents(): Event[] {
    return this.onlyMine ? this.events.filter(e => e.isJoined) : this.events;
  }

  loadEvents(): void {
    this.reload$.next();
  }

  selectCategory(categoryKey: string): void {
    this.selectedCategory = categoryKey;
    this.loadEvents();
  }

  selectTimeFilter(timeKey: TimeFilter): void {
    this.selectedTimeFilter = timeKey;
    this.loadEvents();
  }

  toggleOnlyMine(): void {
    this.onlyMine = !this.onlyMine;
  }

  onSearch(): void {
    this.search$.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.search$.next('');
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.selectedCategory = 'ALL';
    this.selectedTimeFilter = 'ALL';
    this.onlyMine = false;
    this.loadEvents();
  }

  toggleJoin(eventObj: Event, clickEvent: MouseEvent): void {
    clickEvent.stopPropagation();
    clickEvent.preventDefault();
    if (this.pendingJoinId) return;

    if (!eventObj.isJoined && this.isFull(eventObj)) {
      this.toastService.warning('Cet événement est complet.');
      return;
    }

    this.pendingJoinId = eventObj.id;
    this.eventsService.toggleJoin(eventObj).subscribe({
      next: updated => {
        this.pendingJoinId = null;
        if (!updated) return;
        Object.assign(eventObj, updated);
        if (updated.isJoined) {
          this.toastService.success(`Votre inscription à "${eventObj.title}" est confirmée !`);
        } else {
          this.toastService.info(`Participation annulée pour "${eventObj.title}".`);
        }
      },
      error: err => {
        this.pendingJoinId = null;
        this.toastService.error(this.eventsService.errorMessage(err, 'Impossible de modifier votre participation.'));
      }
    });
  }

  getCapacityPercentage(event: Event): number {
    if (!event.maxParticipants || event.maxParticipants === 0) return 0;
    return Math.min(100, Math.round((event.participantCount / event.maxParticipants) * 100));
  }

  isFull(event: Event): boolean {
    return !!event.maxParticipants && event.participantCount >= event.maxParticipants;
  }

  getCategoryLabel(category: string): string {
    return this.eventsService.categoryInfo(category).label;
  }

  ageRange(event: Event): string | null {
    const min = event.minChildAge, max = event.maxChildAge;
    if (min == null && max == null) return null;
    if (min != null && max != null) return `${min}-${max} ans`;
    return min != null ? `dès ${min} ans` : `jusqu'à ${max} ans`;
  }

  getEventDay(date: Date | string): string {
    const d = new Date(date);
    return d.getDate().toString().padStart(2, '0');
  }

  getEventMonth(date: Date | string): string {
    const months = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEP', 'OCT', 'NOV', 'DÉC'];
    const d = new Date(date);
    return months[d.getMonth()] || '';
  }

  trackById(_: number, event: Event): string {
    return event.id;
  }
}
