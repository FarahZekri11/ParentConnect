import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { Conversation, ConversationParticipant, Message } from '../../../shared/models';

// ---------------------------------------------------------------------------
// Messagerie (service Go) via la Gateway :
//   GET   /api/conversations                       conversations de l'utilisateur (+ non lus)
//   POST  /api/conversations                       {type, participants, context}
//   GET   /api/conversations/{id}/messages          historique
//   PATCH /api/conversations/{id}/read              marquer comme lu
//   POST  /api/messages                             {conversation_id, content, attachments[]}
//   POST  /api/messages/attachments                 multipart (conversation_id, file) -> {id}
//   GET   /api/messages/attachments/{id}            image (participants uniquement, chargée avec le jeton)
//   PATCH /api/messages/{id} {content} · DELETE /api/messages/{id}   (expéditeur uniquement)
//   GET   /api/notifications · PATCH /api/notifications/{id}/read · /read-all · GET /unread-count
// Le service ne connaît que des identifiants : le nom de l'expéditeur est enregistré avec chaque message
// (issu du token). Les noms déjà vus sont mémorisés dans le navigateur pour nommer les conversations.
// ---------------------------------------------------------------------------

interface ApiResponse<T> { success: boolean; data: T; error?: string; }
interface ApiConversation {
  id: string; type: 'DIRECT' | 'BABYSITTING' | 'MARKETPLACE' | 'EVENT';
  context?: { reference_id?: string; title?: string };
  participants: string[];
  last_message?: { message_id: string; sender_id: string; sender_name?: string; content: string; created_at: string };
  unread_count: number; created_at: string; updated_at: string;
}
interface ApiMessage {
  id: string; conversation_id: string; sender_id: string; sender_name?: string;
  content: string; read_by: { user_id: string }[] | null; created_at: string;
  attachments?: { id: string; content_type: string; size: number }[];
  edited_at?: string; deleted?: boolean;
}

export const MAX_MESSAGE_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export interface AppNotification {
  id: string; type: string; title: string; message: string; read: boolean; createdAt: Date;
  payload?: Record<string, unknown>;
}

const TYPE_LABELS: Record<string, string> = {
  BABYSITTING: 'Garde d\'enfants',
  MARKETPLACE: 'Marketplace',
  EVENT: 'Événement',
  DIRECT: 'Message direct',
};

@Injectable({ providedIn: 'root' })
export class MessagingService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = environment.apiBaseUrl;

  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  conversations$ = this.conversationsSubject.asObservable();
  private loadedOnce = false;

  private get userId(): string | undefined {
    return this.auth.currentUser?.id;
  }

  // ---------------------------------------------------------- conversations
  /** Recharge la liste des conversations (émise sur conversations$). */
  refreshConversations(): Observable<Conversation[]> {
    const params = new HttpParams().set('limit', 50);
    return this.http.get<ApiResponse<ApiConversation[] | null>>(`${this.api}/api/conversations`, { params }).pipe(
      map(res => (res.data ?? []).map(c => this.toConversation(c))),
      tap(list => {
        this.loadedOnce = true;
        this.conversationsSubject.next(list);
      }),
    );
  }

  getConversations(): Observable<Conversation[]> {
    return this.loadedOnce ? this.conversations$ : this.refreshConversations();
  }

  /**
   * Ouvre (ou crée) une conversation avec un autre utilisateur, liée à un contexte
   * (événement, annonce, garde). Les conversations directes entre 2 personnes sont réutilisées.
   */
  startConversation(otherUserId: string, type: ApiConversation['type'] = 'DIRECT', title?: string, referenceId?: string): Observable<string> {
    const body = {
      type,
      participants: [otherUserId],
      context: title || referenceId ? { title, reference_id: referenceId } : undefined,
    };
    return this.http.post<ApiResponse<{ id: string }>>(`${this.api}/api/conversations`, body).pipe(map(res => res.data.id));
  }

  getMessages(convoId: string): Observable<Message[]> {
    const params = new HttpParams().set('limit', 100);
    return this.http.get<ApiResponse<{ messages: ApiMessage[] | null }>>(`${this.api}/api/conversations/${convoId}/messages`, { params }).pipe(
      map(res => (res.data.messages ?? [])
        .map(m => this.toMessage(m))
        .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())),
    );
  }

  /** Vérification avant envoi (le service revérifie le contenu réel du fichier). */
  validateImage(file: File): string | null {
    if (!IMAGE_TYPES.includes(file.type)) return `« ${file.name} » : seules les images JPEG, PNG, WebP ou GIF sont acceptées.`;
    if (file.size > MAX_IMAGE_BYTES) return `« ${file.name} » dépasse 5 Mo.`;
    return null;
  }

  uploadImage(convoId: string, file: File): Observable<string> {
    const form = new FormData();
    form.append('conversation_id', convoId);
    form.append('file', file, file.name);
    return this.http.post<ApiResponse<{ id: string }>>(`${this.api}/api/messages/attachments`, form)
      .pipe(map(res => res.data.id));
  }

  /** Image jointe chargée avec le jeton (contrôle d'accès côté service) puis affichée via une URL locale. */
  private imageCache = new Map<string, string>();
  loadImage(id: string): Observable<string> {
    const cached = this.imageCache.get(id);
    if (cached) return of(cached);
    return this.http.get(`${this.api}/api/messages/attachments/${encodeURIComponent(id)}`, { responseType: 'blob' }).pipe(
      map(blob => {
        const url = URL.createObjectURL(blob);
        this.imageCache.set(id, url);
        return url;
      }),
    );
  }

  editMessage(messageId: string, content: string): Observable<Message> {
    return this.http.patch<ApiResponse<ApiMessage>>(`${this.api}/api/messages/${messageId}`, { content })
      .pipe(map(res => this.toMessage(res.data)));
  }

  deleteMessage(messageId: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/api/messages/${messageId}`);
  }

  sendMessage(convoId: string, content: string, attachmentIds: string[] = []): Observable<Message> {
    const body = { conversation_id: convoId, content, attachments: attachmentIds.length ? attachmentIds : undefined };
    return this.http.post<ApiResponse<ApiMessage>>(`${this.api}/api/messages`, body).pipe(
      map(res => this.toMessage(res.data)),
      tap(msg => {
        // Met à jour le résumé de la conversation sans attendre le prochain rafraîchissement
        const list = this.conversationsSubject.value.map(c =>
          c.id === convoId ? { ...c, lastMessage: msg, updatedAt: msg.sentAt } : c);
        this.conversationsSubject.next(list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
      }),
    );
  }

  markAsRead(convoId: string): Observable<boolean> {
    return this.http.patch(`${this.api}/api/conversations/${convoId}/read`, {}).pipe(
      map(() => true),
      tap(() => this.conversationsSubject.next(
        this.conversationsSubject.value.map(c => (c.id === convoId ? { ...c, unreadCount: 0 } : c)))),
      catchError(() => of(false)),
    );
  }

  getTotalUnreadCount(): Observable<number> {
    return this.conversations$.pipe(map(list => list.reduce((sum, c) => sum + c.unreadCount, 0)));
  }

  // ---------------------------------------------------------- notifications
  getNotifications(): Observable<{ items: AppNotification[]; unread: number }> {
    return this.http.get<ApiResponse<{ notifications: any[] | null; unread_count: number }>>(`${this.api}/api/notifications`).pipe(
      map(res => ({
        unread: res.data.unread_count,
        items: (res.data.notifications ?? []).map(n => ({
          id: n.id, type: n.type, title: n.title, message: n.message, read: n.read,
          createdAt: new Date(n.created_at), payload: n.payload,
        })),
      })),
    );
  }

  getUnreadNotificationCount(): Observable<number> {
    return this.http.get<ApiResponse<{ unread_count: number }>>(`${this.api}/api/notifications/unread-count`).pipe(
      map(res => res.data.unread_count),
      catchError(() => of(0)),
    );
  }

  markNotificationRead(id: string): Observable<void> {
    return this.http.patch(`${this.api}/api/notifications/${id}/read`, {}).pipe(map(() => undefined));
  }

  markAllNotificationsRead(): Observable<void> {
    return this.http.patch(`${this.api}/api/notifications/read-all`, {}).pipe(map(() => undefined));
  }

  // ------------------------------------------------------------- utilitaires
  errorMessage(err: unknown, fallback: string): string {
    const http = err as HttpErrorResponse;
    if (typeof http?.error?.error === 'string' && http.error.error.trim()) return http.error.error;
    if (http?.status === 429) return 'Vous envoyez trop de messages, patientez une minute.';
    if (http?.status === 413) return 'Image trop volumineuse (5 Mo maximum).';
    if (http?.status === 0) return 'Messagerie indisponible. Vérifiez que la plateforme est démarrée.';
    return fallback;
  }

  private toConversation(c: ApiConversation): Conversation {
    const last = c.last_message;
    if (last?.sender_name) this.rememberName(last.sender_id, last.sender_name);
    const participants: ConversationParticipant[] = c.participants.map(id => ({
      userId: id,
      name: id === this.userId ? this.myName() : (this.knownName(id) ?? this.fallbackName(c)),
    }));
    return {
      id: c.id,
      participants,
      lastMessage: last ? {
        id: last.message_id, conversationId: c.id, senderId: last.sender_id,
        senderName: last.sender_name || this.knownName(last.sender_id) || '',
        content: this.decode(last.content), type: 'TEXT', isRead: c.unread_count === 0,
        sentAt: new Date(last.created_at),
      } : undefined,
      unreadCount: c.unread_count,
      createdAt: new Date(c.created_at),
      updatedAt: new Date(c.updated_at),
      title: c.context?.title || TYPE_LABELS[c.type] || 'Conversation',
      kind: c.type,
    };
  }

  private toMessage(m: ApiMessage): Message {
    if (m.sender_name) this.rememberName(m.sender_id, m.sender_name);
    return {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender_name || this.knownName(m.sender_id) || 'Parent',
      content: this.decode(m.content),
      type: m.attachments?.length ? 'IMAGE' : 'TEXT',
      isRead: (m.read_by ?? []).some(r => r.user_id !== m.sender_id),
      sentAt: new Date(m.created_at),
      attachments: (m.attachments ?? []).map(a => ({ id: a.id, contentType: a.content_type })),
      editedAt: m.edited_at ? new Date(m.edited_at) : undefined,
      deleted: !!m.deleted,
    };
  }

  /** Le service échappe le HTML des messages (protection XSS) : on retrouve le texte saisi. */
  private decode(text: string): string {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value;
  }

  private myName(): string {
    const u = this.auth.currentUser;
    return u ? `${u.firstName} ${u.lastName}`.trim() : 'Moi';
  }

  private fallbackName(c: ApiConversation): string {
    return c.type === 'BABYSITTING' ? 'Parent (garde d\'enfants)' : c.type === 'EVENT' ? 'Équipe ParentConnect' : 'Parent du quartier';
  }

  private knownName(id: string): string | undefined {
    return this.readNames()[id];
  }

  private rememberName(id: string, name: string): void {
    const names = this.readNames();
    if (names[id] === name) return;
    names[id] = name;
    try {
      localStorage.setItem('pc_messaging_names', JSON.stringify(names));
    } catch {
      // stockage indisponible : sans conséquence
    }
  }

  private readNames(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem('pc_messaging_names') || '{}');
    } catch {
      return {};
    }
  }
}
