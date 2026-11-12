import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { MarketplaceService, formatPrice } from '../marketplace/services/marketplace.service';
import { EventsService } from '../events/services/events.service';
import { CommunityService } from '../community/services/community.service';
import { ToastService } from '../../shared/services/toast.service';
import {
  User,
  Family,
  Child,
  Listing,
  ListingType,
  Event as EventModel,
  Post,
  PostType
} from '../../shared/models';

export interface QuickAction {
  title: string;
  description: string;
  icon: string;
  route: string;
  badge?: string;
  theme: 'blue' | 'purple' | 'blush' | 'sky';
}

export interface QuickStat {
  value: string;
  label: string;
  subtext: string;
  icon: string;
  colorClass: string;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  family: Family | null = null;
  nearbyListings: Listing[] = [];
  upcomingEvents: EventModel[] = [];
  recentPosts: Post[] = [];
  isLoadingListings = true;

  quickActions: QuickAction[] = [
    {
      title: 'Publier une annonce',
      description: 'Donner, prêter, vendre ou échanger',
      icon: 'add_shopping_cart',
      route: '/app/marketplace/new',
      badge: 'Don & Prêt',
      theme: 'blue'
    },
    {
      title: 'Trouver une garde',
      description: 'Babysitters disponibles près de chez vous',
      icon: 'child_friendly',
      route: '/app/babysitting',
      badge: 'Quartier',
      theme: 'blush'
    },
    {
      title: 'Poser une question',
      description: 'Échanger avec les parents voisins',
      icon: 'chat_bubble_outline',
      route: '/app/community/new',
      badge: 'Entraide',
      theme: 'purple'
    },
    {
      title: 'Créer un événement',
      description: 'Playdates, sorties, anniversaires',
      icon: 'celebration',
      route: '/app/events/new',
      badge: 'Quartier',
      theme: 'sky'
    }
  ];

  /** Compteurs réels (services Marketplace, Événements, Communauté) ; « … » tant qu'ils chargent. */
  quickStats: QuickStat[] = [
    {
      value: '…',
      label: 'Annonces disponibles',
      subtext: 'Dons, prêts, ventes et échanges',
      icon: 'inventory_2',
      colorClass: 'stat-blue'
    },
    {
      value: '…',
      label: 'Événements ce mois',
      subtext: 'Sorties & ateliers parents-enfants',
      icon: 'calendar_month',
      colorClass: 'stat-purple'
    },
    {
      value: '…',
      label: 'Publications',
      subtext: 'Questions et conseils de la communauté',
      icon: 'forum',
      colorClass: 'stat-blush'
    }
  ];

  private subscriptions = new Subscription();

  constructor(
    private authService: AuthService,
    private marketplaceService: MarketplaceService,
    private eventsService: EventsService,
    private communityService: CommunityService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadUserData();
    this.loadNearbyListings();
    this.loadUpcomingEvents();
    this.loadRecentPosts();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get locationLabel(): string {
    const neighborhood = this.currentUser?.neighborhood || 'Oberkampf';
    const city = this.currentUser?.city || 'Paris 11e';
    return `${city} · ${neighborhood}`;
  }

  get greetingTime(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bel après-midi';
    return 'Bonsoir';
  }

  private loadUserData(): void {
    // Utilisateur connecté et sa propre famille (aucune donnée d'exemple)
    const userSub = this.authService.currentUser$.subscribe(user => this.currentUser = user);
    this.subscriptions.add(userSub);

    const famSub = this.authService.family$.subscribe(fam => this.family = fam);
    this.subscriptions.add(famSub);
  }

  private loadNearbyListings(): void {
    this.isLoadingListings = true;
    const listingSub = this.marketplaceService.getListings({ limit: 4 }).subscribe({
      next: (resp) => {
        this.nearbyListings = resp.listings.slice(0, 4);
        this.quickStats[0].value = String(resp.total);
        this.isLoadingListings = false;
      },
      error: () => {
        this.quickStats[0].value = '–';
        this.isLoadingListings = false;
      }
    });
    this.subscriptions.add(listingSub);
  }

  private loadUpcomingEvents(): void {
    // Prochains événements réels (service Événements via la Gateway) : les 3 premiers à venir
    const eventsSub = this.eventsService.getEvents('ALL', 'ALL').subscribe({
      next: events => {
        const now = new Date();
        this.upcomingEvents = events.filter(e => e.date.getTime() >= now.getTime()).slice(0, 3);
        this.quickStats[1].value = String(events.filter(e =>
          e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth()).length);
      },
      error: () => {
        this.quickStats[1].value = '–';
        this.upcomingEvents = [];
      }
    });
    this.subscriptions.add(eventsSub);
  }

  private loadRecentPosts(): void {
    // Publications récentes réelles (services Communauté via la Gateway) : les 3 dernières
    const postsSub = this.communityService.getPosts('ALL', 'ALL').subscribe({
      next: page => {
        this.recentPosts = page.posts.slice(0, 3);
        this.quickStats[2].value = String(page.total);
      },
      error: () => {
        this.recentPosts = [];
        this.quickStats[2].value = '–';
      }
    });
    this.subscriptions.add(postsSub);
  }

  calculateAge(birthDate: Date | string): string {
    const bDate = new Date(birthDate);
    const now = new Date();
    let years = now.getFullYear() - bDate.getFullYear();
    const months = now.getMonth() - bDate.getMonth();

    if (months < 0 || (months === 0 && now.getDate() < bDate.getDate())) {
      years--;
    }

    if (years === 0) {
      const diffMonths = (now.getFullYear() - bDate.getFullYear()) * 12 + (now.getMonth() - bDate.getMonth());
      return `${Math.max(1, diffMonths)} mois`;
    }

    return `${years} an${years > 1 ? 's' : ''}`;
  }

  getInitials(name: string): string {
    if (!name) return 'PC';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  getListingBadgeLabel(type: ListingType): string {
    switch (type) {
      case 'SALE': return 'Vente';
      case 'DONATION': return 'Don gratuit';
      case 'LENDING': return 'Prêt';
      case 'EXCHANGE': return 'Échange';
      default: return 'Annonce';
    }
  }

  getListingBadgeClass(type: ListingType): string {
    switch (type) {
      case 'SALE': return 'badge-sale';
      case 'DONATION': return 'badge-donation';
      case 'LENDING': return 'badge-lending';
      case 'EXCHANGE': return 'badge-exchange';
      default: return 'badge-neutral';
    }
  }

  getPostTypeBadgeClass(type: PostType): string {
    switch (type) {
      case 'QUESTION': return 'type-question';
      case 'ADVICE': return 'type-advice';
      case 'RECOMMENDATION': return 'type-recommendation';
      case 'DISCUSSION': return 'type-discussion';
      default: return 'type-discussion';
    }
  }

  getPostTypeLabel(type: PostType): string {
    switch (type) {
      case 'QUESTION': return 'Question';
      case 'ADVICE': return 'Partage & conseil';
      case 'RECOMMENDATION': return 'Recommandation';
      case 'DISCUSSION': return 'Discussion';
      default: return 'Post';
    }
  }

  formatEventDate(date: Date | string): { day: string; month: string } {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').toUpperCase();
    return { day, month };
  }

  toggleListingFavorite(listing: Listing, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    // Favori enregistré par le service Marketplace (et mémorisé localement)
    this.marketplaceService.toggleFavorite(listing.id);
    listing.isFavorited = !listing.isFavorited;
  }

  price(item: Listing): string {
    return formatPrice(item.price, item.currency);
  }

  joiningEventId: string | null = null;

  /** Inscription / désinscription réelle (service Participation via la Gateway). */
  toggleEventJoin(eventModel: EventModel, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    if (this.joiningEventId) return;
    this.joiningEventId = eventModel.id;
    const wasJoined = eventModel.isJoined;
    this.eventsService.toggleJoin(eventModel).subscribe({
      next: updated => {
        this.joiningEventId = null;
        if (updated) {
          eventModel.isJoined = updated.isJoined;
          eventModel.participantCount = updated.participantCount;
        }
        this.toast.success(wasJoined ? 'Désinscription enregistrée.' : 'Inscription enregistrée !');
      },
      error: err => {
        this.joiningEventId = null;
        const status = err?.status;
        this.toast.error(status === 403
          ? 'Seuls les comptes Parent peuvent s\'inscrire aux événements.'
          : 'Action impossible pour le moment.');
      }
    });
  }
}
