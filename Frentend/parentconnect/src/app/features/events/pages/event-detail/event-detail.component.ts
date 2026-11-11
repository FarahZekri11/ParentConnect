import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { EventsService } from '../../services/events.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { Event, User } from '../../../../shared/models';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './event-detail.component.html',
  styleUrls: ['./event-detail.component.scss']
})
export class EventDetailComponent implements OnInit {
  event: Event | null = null;
  isLoading = true;
  get loading(): boolean { return this.isLoading; }
  currentUser: User | null = null;
  isProcessingAction = false;

  toggleJoin(): void {
    this.toggleParticipation();
  }

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
      next: evt => {
        this.event = evt || null;
        this.isLoading = false;
        if (!evt) {
          this.toastService.error('Événement introuvable.');
        }
      },
      error: () => {
        this.isLoading = false;
        this.toastService.error('Erreur lors du chargement de l\'événement.');
      }
    });
  }

  toggleParticipation(): void {
    if (!this.event || this.isProcessingAction) return;

    const user = {
      id: this.currentUser ? this.currentUser.id : 'user_current',
      name: this.currentUser ? `${this.currentUser.firstName} ${this.currentUser.lastName}` : 'Moi',
      avatar: this.currentUser?.avatar || ''
    };

    if (
      !this.event.isJoined &&
      this.event.maxParticipants &&
      this.event.participantCount >= this.event.maxParticipants
    ) {
      this.toastService.warning('Cet événement est complet. Impossible de s\'inscrire.');
      return;
    }

    this.isProcessingAction = true;
    this.eventsService.toggleJoin(this.event.id, user).subscribe({
      next: updated => {
        this.event = updated;
        this.isProcessingAction = false;

        if (updated.isJoined) {
          this.toastService.success('Vous êtes inscrit(e) à cet événement ! Un rappel sera envoyé la veille.');
        } else {
          this.toastService.info('Votre participation a été annulée.');
        }
      },
      error: () => {
        this.isProcessingAction = false;
        this.toastService.error('Erreur lors de la modification de votre inscription.');
      }
    });
  }

  getCapacityPercentage(): number {
    if (!this.event || !this.event.maxParticipants) return 0;
    return Math.min(100, Math.round((this.event.participantCount / this.event.maxParticipants) * 100));
  }

  isEventFull(): boolean {
    if (!this.event || !this.event.maxParticipants) return false;
    return this.event.participantCount >= this.event.maxParticipants;
  }

  getGoogleMapsUrl(): string {
    if (!this.event) return '#';
    const query = encodeURIComponent(`${this.event.address}, ${this.event.city} ${this.event.postalCode || ''}`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  getCategoryLabel(category?: string): string {
    if (!category) return '';
    const map: Record<string, string> = {
      WORKSHOP: 'Atelier & Découverte',
      WALK: 'Sortie Poussette & Balade',
      EXCHANGE: 'Bourse & Troc',
      MEETUP: 'Café Parents',
      PLAYDATE: 'Jeux au Square & Éveil',
      SPORT: 'Activité motrice & Sport',
      CULTURE: 'Culture & Contes'
    };
    return map[category] || category;
  }

  getInitials(name?: string): string {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
