import { Injectable } from '@angular/core';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import {
  BabysitterProfile,
  BabysittingRequest,
  BabysittingBooking,
  Availability
} from '../../../shared/models';

export interface BabysitterFilter {
  search?: string;
  neighborhood?: string;
  dayOfWeek?: number | null; // 0=Sun, 1=Mon, ..., 6=Sat
  maxRate?: number;
}

const MOCK_BABYSITTERS: BabysitterProfile[] = [
  {
    id: 'bs_1',
    userId: 'user_bs_1',
    firstName: 'Camille',
    lastName: 'Laurent',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    bio: 'Étudiante en 3ème année d\'orthophonie et titulaire du BAFA. Passionnée par l\'éveil des tout-petits, le dessin et l\'aide aux devoirs. Douce, patiente et toujours à l\'heure !',
    hourlyRate: 14,
    rating: 4.9,
    reviewCount: 28,
    city: 'Paris',
    postalCode: '75011',
    neighborhood: 'Oberkampf',
    verified: true,
    experience: '4 ans d\'expérience auprès de familles parisiennes (nourrissons à 10 ans). Gardes en soirée, sorties d\'école et mercredis après-midi.',
    certifications: ['BAFA Petite Enfance', 'PSC1 (Premiers secours)', 'Casier judiciaire vérifié'],
    languages: ['Français (maternelle)', 'Anglais (courant)'],
    ageGroups: ['Bébés (0-18 mois)', 'Bambins (1-3 ans)', 'Enfants (3-10 ans)'],
    availabilities: [
      { dayOfWeek: 3, startTime: '13:00', endTime: '19:30' }, // Mercredi
      { dayOfWeek: 5, startTime: '17:30', endTime: '23:30' }, // Vendredi
      { dayOfWeek: 6, startTime: '09:00', endTime: '22:00' }, // Samedi
      { dayOfWeek: 0, startTime: '10:00', endTime: '18:00' }  // Dimanche
    ],
    reviews: [
      {
        id: 'rev_1_1',
        authorName: 'Sophie M.',
        rating: 5,
        date: new Date('2026-09-22'),
        comment: 'Camille est tout simplement formidable ! Ponctuelle, souriante et très douce avec notre fils de 2 ans. Nous la recommandons les yeux fermés.'
      },
      {
        id: 'rev_1_2',
        authorName: 'Nicolas D.',
        rating: 4.8,
        date: new Date('2026-09-10'),
        comment: 'Excellente baby-sitter. Les devoirs étaient faits et les enfants étaient ravis des activités manuelles préparées.'
      }
    ],
    createdAt: new Date('2024-05-12')
  },
  {
    id: 'bs_2',
    userId: 'user_bs_2',
    firstName: 'Alexandre',
    lastName: 'Moreau',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80',
    bio: 'Animateur périscolaire en école primaire avec 5 ans d\'expérience. Grand adepte des jeux d\'extérieur, des ateliers scientifiques et d\'un accompagnement scolaire ludique.',
    hourlyRate: 16,
    rating: 5.0,
    reviewCount: 19,
    city: 'Paris',
    postalCode: '75011',
    neighborhood: 'Bastille',
    verified: true,
    experience: '5 ans d\'animation en centres de loisirs et auprès de fratries. Habitué aux enfants vifs et aux sorties sportives au parc.',
    certifications: ['BAFA Approfondissement Jeux collectifs', 'Brevet National de Sécurité Aquatique', 'PSC1'],
    languages: ['Français', 'Anglais', 'Espagnol (intermédiaire)'],
    ageGroups: ['Bambins (2-3 ans)', 'Enfants (4-7 ans)', 'Grands (8-12 ans)'],
    availabilities: [
      { dayOfWeek: 1, startTime: '16:30', endTime: '20:30' }, // Lundi
      { dayOfWeek: 2, startTime: '16:30', endTime: '20:30' }, // Mardi
      { dayOfWeek: 4, startTime: '16:30', endTime: '20:30' }, // Jeudi
      { dayOfWeek: 5, startTime: '17:00', endTime: '23:30' }, // Vendredi
      { dayOfWeek: 6, startTime: '14:00', endTime: '23:00' }  // Samedi
    ],
    reviews: [
      {
        id: 'rev_2_1',
        authorName: 'Marc V.',
        rating: 5,
        date: new Date('2026-09-30'),
        comment: 'Alexandre a immédiatement capté l\'intérêt de nos deux garçons. Rires, jeux calmes avant le dodo, tout était impeccable.'
      },
      {
        id: 'rev_2_2',
        authorName: 'Claire B.',
        rating: 5,
        date: new Date('2026-08-18'),
        comment: 'Très pro, digne de confiance et toujours ultra ponctuel. Les enfants l\'adorent !'
      }
    ],
    createdAt: new Date('2024-03-01')
  },
  {
    id: 'bs_3',
    userId: 'user_bs_3',
    firstName: 'Léa',
    lastName: 'Bernard',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
    bio: 'Future auxiliaire de puériculture. Très à l\'aise avec les nourrissons et les bébés : respect des rythmes de sommeil, biberons, soins et comptines apaisantes.',
    hourlyRate: 13,
    rating: 4.8,
    reviewCount: 34,
    city: 'Paris',
    postalCode: '75012',
    neighborhood: 'Nation',
    verified: true,
    experience: '3 ans d\'expérience dont stages en maternité et crèches parentales. Gardes d\'urgence et soirées de week-end régulières.',
    certifications: ['CAP Petite Enfance (AEPE)', 'PSC1 Nourrisson & Adulte', 'Formation Pédagogie Douce & Portage'],
    languages: ['Français', 'Anglais (scolaire)'],
    ageGroups: ['Nouveau-nés (0-6 mois)', 'Bébés (6-18 mois)', 'Bambins (1-3 ans)'],
    availabilities: [
      { dayOfWeek: 1, startTime: '08:00', endTime: '18:00' }, // Lundi
      { dayOfWeek: 2, startTime: '08:00', endTime: '18:00' }, // Mardi
      { dayOfWeek: 3, startTime: '08:00', endTime: '18:00' }, // Mercredi
      { dayOfWeek: 4, startTime: '08:00', endTime: '18:00' }, // Jeudi
      { dayOfWeek: 5, startTime: '08:00', endTime: '22:00' }  // Vendredi
    ],
    reviews: [
      {
        id: 'rev_3_1',
        authorName: 'Emilie F.',
        rating: 4.9,
        date: new Date('2026-09-14'),
        comment: 'Léa a gardé notre fille de 5 mois avec un soin et une tendresse remarquables. Nous étions 100% rassurés.'
      },
      {
        id: 'rev_3_2',
        authorName: 'Julie L.',
        rating: 4.7,
        date: new Date('2026-07-29'),
        comment: 'Fiable, calme et d\'une grande gentillesse. Une super nounou de quartier.'
      }
    ],
    createdAt: new Date('2023-11-15')
  },
  {
    id: 'bs_4',
    userId: 'user_bs_4',
    firstName: 'Inès',
    lastName: 'Benali',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    bio: 'Étudiante en Master de psychologie de l\'enfant. À l\'écoute des émotions et des besoins de chaque enfant. Activités calmes, lectures animées et cuisine saine pour le dîner.',
    hourlyRate: 15,
    rating: 4.95,
    reviewCount: 22,
    city: 'Paris',
    postalCode: '75020',
    neighborhood: 'Belleville',
    verified: true,
    experience: '4 ans de garde d\'enfants en familles nombreuses. Très vigilante sur la sécurité et le bien-être émotionnel.',
    certifications: ['PSC1 (Prévention et secours civiques)', 'Certification Écoute & Communication Non Violente', 'Casier judiciaire vérifié'],
    languages: ['Français', 'Anglais', 'Arabe'],
    ageGroups: ['Bébés (1-3 ans)', 'Enfants (3-7 ans)', 'Pré-ados (8-11 ans)'],
    availabilities: [
      { dayOfWeek: 3, startTime: '14:00', endTime: '20:00' }, // Mercredi
      { dayOfWeek: 4, startTime: '18:00', endTime: '23:00' }, // Jeudi
      { dayOfWeek: 5, startTime: '18:00', endTime: '00:00' }, // Vendredi
      { dayOfWeek: 6, startTime: '10:00', endTime: '23:00' }, // Samedi
      { dayOfWeek: 0, startTime: '14:00', endTime: '20:00' }  // Dimanche
    ],
    reviews: [
      {
        id: 'rev_4_1',
        authorName: 'Farah Z.',
        rating: 5,
        date: new Date('2026-09-28'),
        comment: 'Inès a géré nos deux enfants avec brio, le coucher s\'est passé comme sur des roulettes ! Nous referons appel à elle très vite.'
      },
      {
        id: 'rev_4_2',
        authorName: 'Alexia T.',
        rating: 4.9,
        date: new Date('2026-08-30'),
        comment: 'Une personne solaire et rassurante. Nos enfants demandent déjà quand est-ce qu\'Inès revient.'
      }
    ],
    createdAt: new Date('2024-01-20')
  },
  {
    id: 'bs_5',
    userId: 'user_bs_5',
    firstName: 'Thomas',
    lastName: 'Rousseau',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
    bio: 'Élève en école d\'éducateur spécialisé. Dynamique, musicien (guitare) et passionné de jeux de société collaboratifs. Spécialiste des soirées détendues sans écrans.',
    hourlyRate: 17,
    rating: 4.85,
    reviewCount: 16,
    city: 'Paris',
    postalCode: '75010',
    neighborhood: 'Canal Saint-Martin',
    verified: true,
    experience: '3 ans d\'accompagnement d\'enfants et d\'adolescents, aide aux devoirs jusqu\'au collège et garde partagée.',
    certifications: ['BAFA Spécialisation Animation musicale', 'PSC1', 'Casier vérifié'],
    languages: ['Français', 'Anglais (bilingue)'],
    ageGroups: ['Enfants (3-6 ans)', 'Enfants (6-10 ans)', 'Ados (11-14 ans)'],
    availabilities: [
      { dayOfWeek: 2, startTime: '17:00', endTime: '22:00' }, // Mardi
      { dayOfWeek: 4, startTime: '17:00', endTime: '22:00' }, // Jeudi
      { dayOfWeek: 5, startTime: '18:00', endTime: '00:00' }, // Vendredi
      { dayOfWeek: 6, startTime: '12:00', endTime: '23:30' }  // Samedi
    ],
    reviews: [
      {
        id: 'rev_5_1',
        authorName: 'Guillaume D.',
        rating: 5,
        date: new Date('2026-09-15'),
        comment: 'Thomas a joué de la guitare et fait des énigmes avec nos enfants. Zéro écran pendant toute la soirée, bravo !'
      }
    ],
    createdAt: new Date('2024-04-10')
  }
];

const MOCK_BOOKINGS: BabysittingBooking[] = [
  {
    id: 'bk_1',
    requestId: 'req_1',
    babysitterId: 'bs_1',
    babysitterName: 'Camille Laurent',
    babysitterAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
    requesterId: 'user_1',
    requesterName: 'Farah Zekri',
    date: new Date('2026-10-10'),
    startTime: '18:30',
    endTime: '22:30',
    totalHours: 4,
    totalCost: 56,
    status: 'ACCEPTED',
    createdAt: new Date('2026-10-02')
  },
  {
    id: 'bk_2',
    requestId: 'req_2',
    babysitterId: 'bs_4',
    babysitterName: 'Inès Benali',
    babysitterAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    requesterId: 'user_1',
    requesterName: 'Farah Zekri',
    date: new Date('2026-10-14'),
    startTime: '17:00',
    endTime: '20:30',
    totalHours: 3.5,
    totalCost: 52.5,
    status: 'PENDING',
    createdAt: new Date('2026-10-04')
  },
  {
    id: 'bk_3',
    requestId: 'req_3',
    babysitterId: 'bs_2',
    babysitterName: 'Alexandre Moreau',
    babysitterAvatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80',
    requesterId: 'user_1',
    requesterName: 'Farah Zekri',
    date: new Date('2026-09-26'),
    startTime: '14:00',
    endTime: '18:00',
    totalHours: 4,
    totalCost: 64,
    status: 'COMPLETED',
    createdAt: new Date('2026-09-20')
  }
];

const MOCK_REQUESTS: BabysittingRequest[] = [
  {
    id: 'req_1',
    requesterId: 'user_1',
    requesterName: 'Farah Zekri',
    babysitterId: 'bs_1',
    babysitterName: 'Camille Laurent',
    children: ['Yasmine', 'Adam'],
    date: new Date('2026-10-10'),
    startTime: '18:30',
    endTime: '22:30',
    address: '14 Rue Oberkampf, 75011 Paris',
    notes: 'Dîner déjà préparé au réfrigérateur. Coucher vers 20h30 pour Adam et 21h00 pour Yasmine.',
    status: 'ACCEPTED',
    createdAt: new Date('2026-10-02')
  },
  {
    id: 'req_2',
    requesterId: 'user_1',
    requesterName: 'Farah Zekri',
    babysitterId: 'bs_4',
    babysitterName: 'Inès Benali',
    children: ['Yasmine'],
    date: new Date('2026-10-14'),
    startTime: '17:00',
    endTime: '20:30',
    address: '14 Rue Oberkampf, 75011 Paris',
    notes: 'Sortie de l\'école à 17h puis goûter et aide pour la lecture.',
    status: 'PENDING',
    createdAt: new Date('2026-10-04')
  },
  {
    id: 'req_3',
    requesterId: 'user_1',
    requesterName: 'Farah Zekri',
    babysitterId: 'bs_2',
    babysitterName: 'Alexandre Moreau',
    children: ['Yasmine', 'Adam'],
    date: new Date('2026-09-26'),
    startTime: '14:00',
    endTime: '18:00',
    address: '14 Rue Oberkampf, 75011 Paris',
    notes: 'Après-midi jeux au square et lecture.',
    status: 'COMPLETED',
    createdAt: new Date('2026-09-20')
  }
];

@Injectable({
  providedIn: 'root'
})
export class BabysittingService {
  private babysittersSubject = new BehaviorSubject<BabysitterProfile[]>([...MOCK_BABYSITTERS]);
  private bookingsSubject = new BehaviorSubject<BabysittingBooking[]>([...MOCK_BOOKINGS]);
  private requestsSubject = new BehaviorSubject<BabysittingRequest[]>([...MOCK_REQUESTS]);

  babysitters$ = this.babysittersSubject.asObservable();
  bookings$ = this.bookingsSubject.asObservable();
  requests$ = this.requestsSubject.asObservable();

  /**
   * Récupère la liste des baby-sitters avec filtres optionnels
   */
  getBabysitters(filter?: BabysitterFilter): Observable<BabysitterProfile[]> {
    return this.babysitters$.pipe(
      map(list => {
        if (!filter) return list;

        return list.filter(b => {
          // Filtre recherche textuelle (nom, prénom, bio)
          if (filter.search && filter.search.trim() !== '') {
            const query = filter.search.toLowerCase().trim();
            const fullName = `${b.firstName} ${b.lastName}`.toLowerCase();
            const inBio = b.bio.toLowerCase().includes(query);
            const inNeighborhood = (b.neighborhood || '').toLowerCase().includes(query);
            if (!fullName.includes(query) && !inBio && !inNeighborhood) {
              return false;
            }
          }

          // Filtre quartier
          if (filter.neighborhood && filter.neighborhood !== 'ALL') {
            if (b.neighborhood !== filter.neighborhood) {
              return false;
            }
          }

          // Filtre jour de disponibilité (0=Dimanche, 1=Lundi, ..., 6=Samedi)
          if (filter.dayOfWeek !== undefined && filter.dayOfWeek !== null) {
            const isAvailable = b.availabilities.some((a: Availability) => a.dayOfWeek === filter.dayOfWeek);
            if (!isAvailable) {
              return false;
            }
          }

          // Filtre tarif horaire max
          if (filter.maxRate !== undefined && filter.maxRate > 0) {
            if (b.hourlyRate > filter.maxRate) {
              return false;
            }
          }

          return true;
        });
      }),
      delay(300)
    );
  }

  /**
   * Récupère le profil détaillé d'un baby-sitter par ID
   */
  getBabysitterById(id: string): Observable<BabysitterProfile | undefined> {
    return of(this.babysittersSubject.value.find(b => b.id === id)).pipe(
      delay(250)
    );
  }

  /**
   * Crée une nouvelle demande de garde (et l'ajoute aussi à la liste des réservations si un baby-sitter est associé)
   */
  createRequest(requestData: Partial<BabysittingRequest>): Observable<BabysittingRequest> {
    const newId = 'req_' + Date.now();
    const targetBabysitter = requestData.babysitterId
      ? this.babysittersSubject.value.find(b => b.id === requestData.babysitterId)
      : undefined;

    const newRequest: BabysittingRequest = {
      id: newId,
      requesterId: requestData.requesterId || 'user_1',
      requesterName: requestData.requesterName || 'Farah Zekri',
      babysitterId: requestData.babysitterId,
      babysitterName: targetBabysitter ? `${targetBabysitter.firstName} ${targetBabysitter.lastName}` : (requestData.babysitterName || 'Demande ouverte'),
      children: requestData.children || ['Enfant'],
      date: requestData.date ? new Date(requestData.date) : new Date(),
      startTime: requestData.startTime || '18:00',
      endTime: requestData.endTime || '21:00',
      address: requestData.address || 'Paris',
      notes: requestData.notes || '',
      status: 'PENDING',
      createdAt: new Date()
    };

    const currentRequests = this.requestsSubject.value;
    this.requestsSubject.next([newRequest, ...currentRequests]);

    // Si la demande cible un baby-sitter particulier, on initialise une réservation en attente
    if (newRequest.babysitterId && targetBabysitter) {
      const hours = this.calculateDuration(newRequest.startTime, newRequest.endTime);
      const totalCost = Math.round(hours * targetBabysitter.hourlyRate * 10) / 10;

      const newBooking: BabysittingBooking = {
        id: 'bk_' + Date.now(),
        requestId: newRequest.id,
        babysitterId: targetBabysitter.id,
        babysitterName: `${targetBabysitter.firstName} ${targetBabysitter.lastName}`,
        babysitterAvatar: targetBabysitter.avatar,
        requesterId: newRequest.requesterId,
        requesterName: newRequest.requesterName,
        date: newRequest.date,
        startTime: newRequest.startTime,
        endTime: newRequest.endTime,
        totalHours: hours,
        totalCost: totalCost,
        status: 'PENDING',
        createdAt: new Date()
      };

      const currentBookings = this.bookingsSubject.value;
      this.bookingsSubject.next([newBooking, ...currentBookings]);
    }

    return of(newRequest).pipe(delay(500));
  }

  /**
   * Récupère la liste des réservations de l'utilisateur courant
   */
  getMyBookings(): Observable<BabysittingBooking[]> {
    return this.bookings$.pipe(
      delay(300)
    );
  }

  /**
   * Récupère la liste des demandes de l'utilisateur courant
   */
  getMyRequests(): Observable<BabysittingRequest[]> {
    return this.requests$.pipe(
      delay(300)
    );
  }

  /**
   * Annule une réservation
   */
  cancelBooking(bookingId: string): Observable<void> {
    const updated = this.bookingsSubject.value.map(b =>
      b.id === bookingId ? { ...b, status: 'CANCELLED' as const } : b
    );
    this.bookingsSubject.next(updated);
    return of(undefined).pipe(delay(300));
  }

  /**
   * Calcule le nombre d'heures entre deux chaînes "HH:mm"
   */
  private calculateDuration(startTime: string, endTime: string): number {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      let endMinutes = eh * 60 + em;
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60; // Gère le passage à minuit
      }
      const diffHours = (endMinutes - startMinutes) / 60;
      return Math.round(diffHours * 10) / 10;
    } catch {
      return 3;
    }
  }
}
