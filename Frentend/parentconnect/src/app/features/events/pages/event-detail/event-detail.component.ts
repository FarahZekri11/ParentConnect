import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { EventsService } from '../../services/events.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Event, User } from '../../../../shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './event-detail.component.html',
  styleUrls: ['./event-detail.component.scss']
})
export class EventDetailComponent implements OnInit {
  event: Event | null = null;
  isLoading = true;
  get loading(): boolean { return this.isLoading; }
  currentUser: User | null = null;
  isProcessingAction = false;
  isAdmin = false;
  isParent = false;

  /** Formulaire d'inscription (parent) */
  childrenCount = 1;
  note = '';
  readonly childrenOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventsService: EventsService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(u => {
      this.currentUser = u;
      this.isAdmin = this.eventsService.isAdmin();
      this.isParent = this.eventsService.isParent();
    });

    const eventId = this.route.snapshot.paramMap.get('id');
    if (eventId) {
      this.loadEvent(eventId);
    } else {
      this.isLoading = false;
    }
  }

  loadEvent(id: string): void {
    this.isLoading = true;
    this.eventsService.getEventById(id).subscribe({
      next: evt => this.applyEvent(evt),
      error: err => {
        this.isLoading = false;
        this.toastService.error(this.eventsService.errorMessage(err, 'Erreur lors du chargement de l\'événement.'));
      }
    });
  }

  private applyEvent(evt: Event | undefined): void {
    this.event = evt || null;
    this.isLoading = false;
    if (evt?.isJoined) {
      this.childrenCount = evt.myChildrenCount ?? 1;
      this.note = evt.myNote ?? '';
    }
  }

  // ------------------------------------------------------------- parent
  get canRegister(): boolean {
    return !!this.event && this.isParent && this.event.status === 'PUBLISHED' && !this.hasStarted();
  }

  join(): void {
    if (!this.event || this.isProcessingAction) return;
    if (this.isEventFull()) {
      this.toastService.warning('Cet événement est complet.');
      return;
    }
    this.isProcessingAction = true;
    this.eventsService.join(this.event.id, { childrenCount: this.childrenCount, note: this.note }).subscribe({
      next: updated => {
        this.isProcessingAction = false;
        this.applyEvent(updated);
        this.toastService.success('Inscription confirmée ! L\'organisateur est prévenu.');
      },
      error: err => {
        this.isProcessingAction = false;
        this.toastService.error(this.eventsService.errorMessage(err, 'Impossible de vous inscrire.'));
      }
    });
  }

  leave(): void {
    if (!this.event || this.isProcessingAction) return;
    this.isProcessingAction = true;
    this.eventsService.leave(this.event.id).subscribe({
      next: updated => {
        this.isProcessingAction = false;
        this.applyEvent(updated);
        this.childrenCount = 1;
        this.note = '';
        this.toastService.info('Votre participation a été annulée.');
      },
      error: err => {
        this.isProcessingAction = false;
        this.toastService.error(this.eventsService.errorMessage(err, 'Impossible d\'annuler votre participation.'));
      }
    });
  }

  /** Compatibilité avec l'ancien bouton unique. */
  toggleParticipation(): void {
    this.event?.isJoined ? this.leave() : this.join();
  }

  toggleJoin(): void {
    this.toggleParticipation();
  }

  // -------------------------------------------------------------- admin
  cancelEvent(): void {
    if (!this.event || this.isProcessingAction) return;
    const confirmed = window.confirm(
      `Annuler « ${this.event.title} » ? Les ${this.event.participantCount} famille(s) inscrite(s) seront prévenues.`);
    if (!confirmed) return;
    this.isProcessingAction = true;
    this.eventsService.cancelEvent(this.event.id).subscribe({
      next: () => {
        this.isProcessingAction = false;
        this.toastService.success('Événement annulé. Les participants ont été notifiés.');
        this.loadEvent(this.event!.id);
      },
      error: err => {
        this.isProcessingAction = false;
        this.toastService.error(this.eventsService.errorMessage(err, 'Impossible d\'annuler l\'événement.'));
      }
    });
  }

  get totalChildren(): number {
    return (this.event?.participants ?? []).reduce((sum, p) => sum + (p.childrenCount ?? 1), 0);
  }

  /** Liste des participants au format CSV (Excel), pour l'organisateur. */
  exportParticipants(): void {
    if (!this.event?.participants?.length) return;
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Participant', 'Enfants', 'Message', 'Inscrit le'],
      ...this.event.participants.map(p => [
        p.name, p.childrenCount ?? 1, p.note ?? '', new Date(p.joinedAt).toLocaleString('fr-FR')
      ]),
    ];
    const csv = '﻿' + rows.map(r => r.map(escape).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `participants-${this.event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------ affichage
  hasStarted(): boolean {
    return !!this.event?.startDateTime && new Date(this.event.startDateTime).getTime() <= Date.now();
  }

  getCapacityPercentage(): number {
    if (!this.event || !this.event.maxParticipants) return 0;
    return Math.min(100, Math.round((this.event.participantCount / this.event.maxParticipants) * 100));
  }

  isEventFull(): boolean {
    if (!this.event || !this.event.maxParticipants) return false;
    return this.event.participantCount >= this.event.maxParticipants;
  }

  ageRange(): string {
    const min = this.event?.minChildAge, max = this.event?.maxChildAge;
    if (min == null && max == null) return 'Tous âges';
    if (min != null && max != null) return `${min} à ${max} ans`;
    return min != null ? `Dès ${min} ans` : `Jusqu'à ${max} ans`;
  }

  getGoogleMapsUrl(): string {
    if (!this.event) return '#';
    const query = encodeURIComponent([this.event.address, this.event.city].filter(Boolean).join(", "));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  getCategoryLabel(category?: string): string {
    return category ? this.eventsService.categoryInfo(category).label : '';
  }

  getInitials(name?: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .filter(Boolean)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
