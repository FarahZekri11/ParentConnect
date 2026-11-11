import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventsService } from './services/events.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Event, User } from '../../shared/models';

interface CategoryFilter {
  key: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss']
})
export class EventsComponent implements OnInit {
  events: Event[] = [];
  isLoading = true;
  selectedCategory = 'ALL';
  selectedTimeFilter: 'ALL' | 'UPCOMING' | 'THIS_WEEK' | 'THIS_MONTH' = 'ALL';
  searchQuery = '';
  currentUser: User | null = null;

  categories: CategoryFilter[] = [
    { key: 'ALL', label: 'Tous', icon: 'event' },
    { key: 'WORKSHOP', label: 'Ateliers', icon: 'palette' },
    { key: 'WALK', label: 'Sorties & Balades', icon: 'directions_walk' },
    { key: 'EXCHANGE', label: 'Bourses & Troc', icon: 'swap_horiz' },
    { key: 'MEETUP', label: 'Cafés Parents', icon: 'local_cafe' },
    { key: 'PLAYDATE', label: 'Jeux & Éveil', icon: 'toys' }
  ];

  timeFilters = [
    { key: 'ALL', label: 'Toutes dates' },
    { key: 'THIS_WEEK', label: 'Cette semaine' },
    { key: 'THIS_MONTH', label: 'Ce mois-ci' }
  ];

  constructor(
    private eventsService: EventsService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(u => {
      this.currentUser = u;
    });
    this.loadEvents();
  }

  loadEvents(): void {
    this.isLoading = true;
    this.eventsService
      .getEvents(this.selectedCategory, this.selectedTimeFilter, this.searchQuery)
      .subscribe({
        next: events => {
          this.events = events;
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
          this.toastService.error('Erreur lors du chargement des événements.');
        }
      });
  }

  selectCategory(categoryKey: string): void {
    this.selectedCategory = categoryKey;
    this.loadEvents();
  }

  selectTimeFilter(timeKey: any): void {
    this.selectedTimeFilter = timeKey;
    this.loadEvents();
  }

  onSearch(): void {
    this.loadEvents();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadEvents();
  }

  toggleJoin(eventObj: Event, clickEvent: MouseEvent): void {
    clickEvent.stopPropagation();
    clickEvent.preventDefault();

    const user = {
      id: this.currentUser ? this.currentUser.id : 'user_current',
      name: this.currentUser ? `${this.currentUser.firstName} ${this.currentUser.lastName}` : 'Moi',
      avatar: this.currentUser?.avatar || ''
    };

    if (
      !eventObj.isJoined &&
      eventObj.maxParticipants &&
      eventObj.participantCount >= eventObj.maxParticipants
    ) {
      this.toastService.warning('Cet événement est complet.');
      return;
    }

    this.eventsService.toggleJoin(eventObj.id, user).subscribe({
      next: updatedEvent => {
        eventObj.isJoined = updatedEvent.isJoined;
        eventObj.participantCount = updatedEvent.participantCount;
        eventObj.participants = updatedEvent.participants;

        if (updatedEvent.isJoined) {
          this.toastService.success(`Votre inscription à "${eventObj.title}" est confirmée !`);
        } else {
          this.toastService.info(`Participation annulée pour "${eventObj.title}".`);
        }
      },
      error: () => {
        this.toastService.error('Impossible de modifier votre participation.');
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
    const map: Record<string, string> = {
      WORKSHOP: 'Atelier',
      WALK: 'Sortie',
      EXCHANGE: 'Bourse & Troc',
      MEETUP: 'Café Parents',
      PLAYDATE: 'Jeux & Éveil',
      SPORT: 'Sport parents-bébé',
      CULTURE: 'Culture & Contes',
      OTHER: 'Autre événement'
    };
    return map[category] || category;
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
}
