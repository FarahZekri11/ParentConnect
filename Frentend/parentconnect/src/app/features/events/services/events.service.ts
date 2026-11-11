import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { Event, EventCategory } from '../../../shared/models';

export interface EventParticipant {
  id: string;
  name: string;
  avatar?: string;
}

const MOCK_EVENTS: any[] = [
  {
    id: '1',
    organizerId: 'user_2',
    organizerName: 'Marie L.',
    organizerAvatar: '',
    title: 'Sortie poussette au Parc des Buttes-Chaumont',
    description: 'Balade matinale conviviale entre parents et bébés (0-2 ans). Tour du lac et pause café/goûter à la brasserie du parc. Poussettes et porte-bébés bienvenus !',
    category: 'WALK',
    imageUrl: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80',
    date: new Date('2026-10-18'),
    startTime: '10:00',
    endTime: '12:00',
    address: 'Entrée principale, 1 Rue Botzaris',
    city: 'Paris',
    postalCode: '75019',
    maxParticipants: 10,
    participantCount: 6,
    isJoined: true,
    isFree: true,
    participants: [
      { id: 'user_1', name: 'Farah Zekri', avatar: '' },
      { id: 'user_3', name: 'Sophie M.', avatar: '' }
    ],
    createdAt: new Date('2026-10-01'),
  },
  {
    id: '2',
    organizerId: 'user_3',
    organizerName: 'Sophie M.',
    organizerAvatar: '',
    title: 'Atelier Motricité Libre (6-18 mois)',
    description: 'Espace sécurisé aménagé avec modules en mousse et parcours sensoriel. Animé par Sophie, psychomotricienne et maman. Échanges et conseils pratiques.',
    category: 'WORKSHOP',
    imageUrl: 'https://images.unsplash.com/photo-1596460107916-430662021049?w=600&q=80',
    date: new Date('2026-10-22'),
    startTime: '14:30',
    endTime: '16:00',
    address: 'Maison des Associations, 12 Rue Oberkampf',
    city: 'Paris',
    postalCode: '75011',
    maxParticipants: 8,
    participantCount: 5,
    isJoined: false,
    isFree: false,
    price: 10,
    participants: [],
    createdAt: new Date('2026-10-02'),
  },
  {
    id: '3',
    organizerId: 'user_5',
    organizerName: 'Emma R.',
    organizerAvatar: '',
    title: 'Café des Parents : Le sommeil des tout-petits',
    description: 'Rencontre informelle autour d\'un thé ou d\'un café pour aborder les nuits hachées, les rituels du coucher et les astuces bienveillantes.',
    category: 'MEETUP',
    imageUrl: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=600&q=80',
    date: new Date('2026-10-25'),
    startTime: '09:30',
    endTime: '11:00',
    address: 'Café Bébé, 45 Rue de Charonne',
    city: 'Paris',
    postalCode: '75011',
    maxParticipants: 12,
    participantCount: 11,
    isJoined: false,
    isFree: true,
    participants: [],
    createdAt: new Date('2026-10-03'),
  },
  {
    id: '4',
    organizerId: 'user_4',
    organizerName: 'Lucas P.',
    organizerAvatar: '',
    title: 'Bourse aux vêtements & jouets d\'hiver',
    description: 'Grand vide-dressing de quartier ! Venez échanger ou acheter à prix mini vêtements chauds (0-6 ans) et jouets avant les fêtes.',
    category: 'EXCHANGE',
    imageUrl: 'https://images.unsplash.com/photo-1541089404510-5c9a779841fc?w=600&q=80',
    date: new Date('2026-11-08'),
    startTime: '10:00',
    endTime: '17:00',
    address: 'Salle polyvalente Parmentier',
    city: 'Paris',
    postalCode: '75011',
    maxParticipants: 50,
    participantCount: 34,
    isJoined: false,
    isFree: true,
    participants: [],
    createdAt: new Date('2026-10-04'),
  },
];

@Injectable({ providedIn: 'root' })
export class EventsService {
  private events = [...MOCK_EVENTS];

  getEvents(category?: string, timeFilter?: string, search?: string): Observable<any[]> {
    let list = [...this.events];
    if (category && category !== 'ALL') {
      list = list.filter(e => e.category === category);
    }
    if (search && search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.city.toLowerCase().includes(q));
    }
    return of(list).pipe(delay(350));
  }

  getEventById(id: string): Observable<any | undefined> {
    return of(this.events.find(e => e.id === id)).pipe(delay(300));
  }

  toggleJoin(id: string, user?: any): Observable<any> {
    const idx = this.events.findIndex(e => e.id === id);
    if (idx > -1) {
      const isCurrentlyJoined = this.events[idx].isJoined;
      const willBeJoined = !isCurrentlyJoined;
      const count = willBeJoined
        ? this.events[idx].participantCount + 1
        : Math.max(0, this.events[idx].participantCount - 1);

      let parts = this.events[idx].participants || [];
      if (willBeJoined && user) {
        parts = [...parts, user];
      } else if (!willBeJoined && user) {
        parts = parts.filter((p: any) => p.id !== user.id);
      }

      this.events[idx] = {
        ...this.events[idx],
        isJoined: willBeJoined,
        participantCount: count,
        participants: parts,
      };
      return of(this.events[idx]);
    }
    throw new Error('Event not found');
  }

  createEvent(data: any, organizerName?: string, organizerId?: string): Observable<any> {
    const newEvent: any = {
      id: 'event_' + Date.now(),
      organizerId: organizerId || data.organizerId || 'user_1',
      organizerName: organizerName || data.organizerName || 'Farah Zekri',
      title: data.title || '',
      description: data.description || '',
      category: data.category || 'MEETUP',
      imageUrl: data.imageUrl || 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=600&q=80',
      date: new Date(data.date || new Date()),
      startTime: data.startTime || '10:00',
      endTime: data.endTime,
      address: data.address || '',
      city: data.city || 'Paris',
      postalCode: data.postalCode || '75011',
      maxParticipants: data.maxParticipants || 15,
      participantCount: 1,
      isJoined: true,
      isFree: data.isFree ?? true,
      price: data.price,
      participants: [{ id: organizerId || 'user_1', name: organizerName || 'Farah Zekri' }],
      createdAt: new Date(),
    };
    this.events.unshift(newEvent);
    return of(newEvent).pipe(delay(500));
  }
}
