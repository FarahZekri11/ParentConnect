import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { Conversation, Message } from '../../../shared/models';

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_1',
    participants: [
      { userId: 'user_1', name: 'Farah Zekri', isOnline: true },
      { userId: 'user_2', name: 'Marie L.', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&q=80', isOnline: true }
    ],
    lastMessage: {
      id: 'msg_1_4',
      conversationId: 'conv_1',
      senderId: 'user_2',
      senderName: 'Marie L.',
      content: 'Parfait ! Tu peux passer vers 18h récupérer la poussette Cybex ?',
      type: 'TEXT',
      isRead: false,
      sentAt: new Date(Date.now() - 1000 * 60 * 15) // 15 mins ago
    },
    unreadCount: 1,
    isOnline: true,
    createdAt: new Date('2026-09-21T09:30:00'),
    updatedAt: new Date(Date.now() - 1000 * 60 * 15)
  },
  {
    id: 'conv_2',
    participants: [
      { userId: 'user_1', name: 'Farah Zekri', isOnline: true },
      { userId: 'user_3', name: 'Sophie M.', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&q=80', isOnline: false }
    ],
    lastMessage: {
      id: 'msg_2_3',
      conversationId: 'conv_2',
      senderId: 'user_3',
      senderName: 'Sophie M.',
      content: 'Bonjour Farah, je suis bien disponible ce samedi pour garder Yasmine et Adam si besoin !',
      type: 'TEXT',
      isRead: false,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 2) // 2 hours ago
    },
    unreadCount: 1,
    isOnline: false,
    createdAt: new Date('2026-09-24T14:10:00'),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2)
  },
  {
    id: 'conv_3',
    participants: [
      { userId: 'user_1', name: 'Farah Zekri', isOnline: true },
      { userId: 'user_5', name: 'Emma R.', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&q=80', isOnline: true }
    ],
    lastMessage: {
      id: 'msg_3_3',
      conversationId: 'conv_3',
      senderId: 'user_1',
      senderName: 'Farah Zekri',
      content: 'Merci beaucoup pour ta recommandation de pédiatre dans le 11ème, le Dr Petit est super !',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 26) // yesterday
    },
    unreadCount: 0,
    isOnline: true,
    createdAt: new Date('2026-09-28T11:00:00'),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 26)
  }
];

const INITIAL_MESSAGES: Record<string, Message[]> = {
  conv_1: [
    {
      id: 'msg_1_1',
      conversationId: 'conv_1',
      senderId: 'user_1',
      senderName: 'Farah Zekri',
      content: 'Bonjour Marie ! J\'ai vu ton annonce pour le prêt de la poussette Cybex Eezy S Twist. Est-elle toujours disponible ?',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 5)
    },
    {
      id: 'msg_1_2',
      conversationId: 'conv_1',
      senderId: 'user_2',
      senderName: 'Marie L.',
      content: 'Bonjour Farah ! Oui tout à fait, elle est prête et très propre avec sa housse de transport.',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 4)
    },
    {
      id: 'msg_1_3',
      conversationId: 'conv_1',
      senderId: 'user_1',
      senderName: 'Farah Zekri',
      content: 'Super nouvelle ! Nous partons en week-end et cela nous sauverait la vie. Quand serais-tu disponible pour que je vienne la chercher ?',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 3)
    },
    {
      id: 'msg_1_4',
      conversationId: 'conv_1',
      senderId: 'user_2',
      senderName: 'Marie L.',
      content: 'Parfait ! Tu peux passer vers 18h récupérer la poussette Cybex ?',
      type: 'TEXT',
      isRead: false,
      sentAt: new Date(Date.now() - 1000 * 60 * 15)
    }
  ],
  conv_2: [
    {
      id: 'msg_2_1',
      conversationId: 'conv_2',
      senderId: 'user_1',
      senderName: 'Farah Zekri',
      content: 'Bonjour Sophie, j\'ai vu ton profil de babysitting sur ParentConnect, tes retours sont excellents.',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24)
    },
    {
      id: 'msg_2_2',
      conversationId: 'conv_2',
      senderId: 'user_3',
      senderName: 'Sophie M.',
      content: 'Merci Farah ! Avec plaisir, j\'ai beaucoup d\'expérience avec les enfants en bas âge (j\'ai le BAFA et 4 ans de garde).',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 12)
    },
    {
      id: 'msg_2_3',
      conversationId: 'conv_2',
      senderId: 'user_3',
      senderName: 'Sophie M.',
      content: 'Bonjour Farah, je suis bien disponible ce samedi pour garder Yasmine et Adam si besoin !',
      type: 'TEXT',
      isRead: false,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 2)
    }
  ],
  conv_3: [
    {
      id: 'msg_3_1',
      conversationId: 'conv_3',
      senderId: 'user_1',
      senderName: 'Farah Zekri',
      content: 'Coucou Emma, tu m\'avais parlé d\'un super pédiatre près d\'Oberkampf, pourrais-tu me redonner son contact ?',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 48)
    },
    {
      id: 'msg_3_2',
      conversationId: 'conv_3',
      senderId: 'user_5',
      senderName: 'Emma R.',
      content: 'Coucou ! Oui bien sûr, c\'est le cabinet du Dr Petit rue Oberkampf. Très à l\'écoute et prend toujours les urgences pour les petits.',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 30)
    },
    {
      id: 'msg_3_3',
      conversationId: 'conv_3',
      senderId: 'user_1',
      senderName: 'Farah Zekri',
      content: 'Merci beaucoup pour ta recommandation de pédiatre dans le 11ème, le Dr Petit est super !',
      type: 'TEXT',
      isRead: true,
      sentAt: new Date(Date.now() - 1000 * 60 * 60 * 26)
    }
  ]
};

@Injectable({
  providedIn: 'root'
})
export class MessagingService {
  private conversationsSubject = new BehaviorSubject<Conversation[]>(INITIAL_CONVERSATIONS);
  private messagesSubject = new BehaviorSubject<Record<string, Message[]>>(INITIAL_MESSAGES);

  conversations$ = this.conversationsSubject.asObservable();

  getConversations(): Observable<Conversation[]> {
    return this.conversations$.pipe(delay(200));
  }

  getMessages(convoId: string): Observable<Message[]> {
    return this.messagesSubject.pipe(
      map(store => store[convoId] ? [...store[convoId]] : []),
      delay(150)
    );
  }

  sendMessage(convoId: string, content: string, senderId = 'user_1', senderName = 'Farah Zekri'): Observable<Message> {
    const newMessage: Message = {
      id: 'msg_' + Date.now(),
      conversationId: convoId,
      senderId,
      senderName,
      content: content.trim(),
      type: 'TEXT',
      isRead: true,
      sentAt: new Date()
    };

    const currentStore = { ...this.messagesSubject.value };
    const list = currentStore[convoId] ? [...currentStore[convoId]] : [];
    list.push(newMessage);
    currentStore[convoId] = list;
    this.messagesSubject.next(currentStore);

    // Update conversation list metadata (lastMessage, updatedAt, order)
    const convos = this.conversationsSubject.value.map(c => {
      if (c.id === convoId) {
        return {
          ...c,
          lastMessage: newMessage,
          updatedAt: newMessage.sentAt
        };
      }
      return c;
    });

    // Re-sort conversations by newest message
    convos.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    this.conversationsSubject.next(convos);

    return of(newMessage).pipe(delay(100));
  }

  markAsRead(convoId: string): Observable<boolean> {
    // Mark conversation unreadCount to 0
    const convos = this.conversationsSubject.value.map(c => {
      if (c.id === convoId) {
        return {
          ...c,
          unreadCount: 0,
          lastMessage: c.lastMessage ? { ...c.lastMessage, isRead: true } : undefined
        };
      }
      return c;
    });
    this.conversationsSubject.next(convos);

    // Mark messages in store as read
    const currentStore = { ...this.messagesSubject.value };
    if (currentStore[convoId]) {
      currentStore[convoId] = currentStore[convoId].map(m => ({ ...m, isRead: true }));
      this.messagesSubject.next(currentStore);
    }

    return of(true);
  }

  getTotalUnreadCount(): Observable<number> {
    return this.conversations$.pipe(
      map(convos => convos.reduce((acc, c) => acc + (c.unreadCount || 0), 0))
    );
  }
}
