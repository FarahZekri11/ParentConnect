import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { MarketplaceService } from '../marketplace/services/marketplace.service';
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
      description: 'Babysitters de confiance vérifiés',
      icon: 'child_friendly',
      route: '/app/babysitting',
      badge: 'Vérifiés',
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

  quickStats: QuickStat[] = [
    {
      value: '28',
      label: 'Annonces à proximité',
      subtext: 'Dans votre rayon de 2 km',
      icon: 'inventory_2',
      colorClass: 'stat-blue'
    },
    {
      value: '14',
      label: 'Événements ce mois',
      subtext: 'Sorties & ateliers parents-enfants',
      icon: 'calendar_month',
      colorClass: 'stat-purple'
    },
    {
      value: '42',
      label: 'Familles connectées',
      subtext: 'Oberkampf & Nation',
      icon: 'groups',
      colorClass: 'stat-blush'
    }
  ];

  private subscriptions = new Subscription();

  constructor(
    private authService: AuthService,
    private marketplaceService: MarketplaceService
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
    const userSub = this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.currentUser = user;
      } else {
        // Fallback default user for presentation if not loaded from storage
        this.currentUser = {
          id: 'user_1',
          firstName: 'Farah',
          lastName: 'Zekri',
          email: 'farah.zekri@email.com',
          city: 'Paris 11e',
          neighborhood: 'Oberkampf',
          postalCode: '75011',
          joinedAt: new Date('2025-03-15'),
          role: 'USER'
        };
      }
    });
    this.subscriptions.add(userSub);

    const famSub = this.authService.getFamily().subscribe({
      next: (fam) => {
        this.family = fam;
      },
      error: () => {
        this.family = {
          id: 'family_1',
          userId: 'user_1',
          name: 'Famille Zekri',
          children: [
            {
              id: 'c1',
              firstName: 'Yasmine',
              birthDate: new Date('2022-06-10'),
              gender: 'F',
              notes: '3 ans'
            },
            {
              id: 'c2',
              firstName: 'Adam',
              birthDate: new Date('2024-01-22'),
              gender: 'M',
              notes: '1 an'
            }
          ]
        };
      }
    });
    this.subscriptions.add(famSub);
  }

  private loadNearbyListings(): void {
    this.isLoadingListings = true;
    const listingSub = this.marketplaceService.getListings({ limit: 4 }).subscribe({
      next: (resp) => {
        this.nearbyListings = resp.listings.slice(0, 4);
        this.isLoadingListings = false;
      },
      error: () => {
        this.isLoadingListings = false;
      }
    });
    this.subscriptions.add(listingSub);
  }

  private loadUpcomingEvents(): void {
    // Curated local events for Oberkampf and 11th arrondissement
    this.upcomingEvents = [
      {
        id: 'event_1',
        organizerId: 'org_1',
        organizerName: 'Claire & Léo',
        title: 'Atelier Motricité & Éveil Musical (1-3 ans)',
        description: 'Séance sensorielle animée par une psychomotricienne au café des enfants.',
        category: 'WORKSHOP',
        date: new Date('2026-11-14'),
        startTime: '10:00',
        endTime: '11:15',
        address: 'Café des Petits Pas, 14 rue Oberkampf',
        city: 'Paris',
        postalCode: '75011',
        maxParticipants: 8,
        participantCount: 6,
        isJoined: false,
        isFree: false,
        price: 12,
        createdAt: new Date('2026-11-02')
      },
      {
        id: 'event_2',
        organizerId: 'org_2',
        organizerName: 'Romain D.',
        title: 'Grand Playdate au Square Maurice Gardette',
        description: 'Rencontre informelle de parents, jeux libres, draisiennes et goûter partagé.',
        category: 'PLAYDATE',
        date: new Date('2026-11-18'),
        startTime: '16:00',
        endTime: '18:00',
        address: 'Square Maurice Gardette',
        city: 'Paris',
        postalCode: '75011',
        maxParticipants: 15,
        participantCount: 11,
        isJoined: true,
        isFree: true,
        createdAt: new Date('2026-11-04')
      },
      {
        id: 'event_3',
        organizerId: 'org_3',
        organizerName: 'Association Parenthèse',
        title: 'Bourse d’échange & troc de jouets d’automne',
        description: 'Apportez vos jouets et livres délaissés pour leur donner une seconde vie entre voisins.',
        category: 'EXCHANGE',
        date: new Date('2026-11-22'),
        startTime: '14:30',
        endTime: '17:30',
        address: 'Maison des Associations, 8 rue du Général Renault',
        city: 'Paris',
        postalCode: '75011',
        maxParticipants: 30,
        participantCount: 22,
        isJoined: false,
        isFree: true,
        createdAt: new Date('2026-11-06')
      }
    ];
  }

  private loadRecentPosts(): void {
    // Recent lively community posts from neighborhood parents
    this.recentPosts = [
      {
        id: 'post_1',
        authorId: 'u_10',
        authorName: 'Camille R.',
        type: 'QUESTION',
        category: 'HEALTH',
        title: 'Recherche pédiatre à l’écoute quartier Saint-Ambroise / Oberkampf',
        content: 'Bonjour à tous ! Notre pédiatre part à la retraite. Auriez-vous un bon praticien bienveillant à nous recommander dans les environs ? Merci d’avance pour vos retours ! 🙏',
        commentCount: 9,
        likeCount: 14,
        isLiked: false,
        isSaved: true,
        createdAt: new Date('2026-11-09T11:30:00'),
        updatedAt: new Date('2026-11-09T11:30:00')
      },
      {
        id: 'post_2',
        authorId: 'u_11',
        authorName: 'Marc V.',
        type: 'RECOMMENDATION',
        category: 'ACTIVITIES',
        title: 'Super découverte : les bébés lecteurs à la Médiathèque Parmentier',
        content: 'Nous avons testé la séance du samedi matin avec notre fille de 18 mois : conteuses géniales, tapis moelleux et belle sélection d’albums. Pensez à réserver quelques jours avant !',
        commentCount: 4,
        likeCount: 22,
        isLiked: true,
        isSaved: false,
        createdAt: new Date('2026-11-08T16:45:00'),
        updatedAt: new Date('2026-11-08T16:45:00')
      },
      {
        id: 'post_3',
        authorId: 'u_12',
        authorName: 'Émilie & Julien',
        type: 'ADVICE',
        category: 'EDUCATION',
        title: 'Organisation garde partagée : notre contrat type et retour d’expérience',
        content: 'Après 2 ans de garde partagée réussie avec nos voisins de palier, nous avons rédigé un petit guide pratique sur la gestion des congés et des frais communs si cela peut vous aider.',
        commentCount: 12,
        likeCount: 38,
        isLiked: false,
        isSaved: false,
        createdAt: new Date('2026-11-06T19:20:00'),
        updatedAt: new Date('2026-11-06T19:20:00')
      }
    ];
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
      case 'ADVICE': return 'Conseil';
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
    listing.isFavorited = !listing.isFavorited;
  }

  toggleEventJoin(eventModel: EventModel, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    eventModel.isJoined = !eventModel.isJoined;
    if (eventModel.isJoined) {
      eventModel.participantCount++;
    } else {
      eventModel.participantCount--;
    }
  }
}
