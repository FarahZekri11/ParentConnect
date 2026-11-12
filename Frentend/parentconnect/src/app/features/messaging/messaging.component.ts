import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, interval, from, of } from 'rxjs';
import { concatMap, switchMap, toArray } from 'rxjs/operators';
import { ToastService } from '../../shared/services/toast.service';
import { MAX_MESSAGE_IMAGES, MessagingService } from './services/messaging.service';
import { Conversation, Message, ConversationParticipant } from '../../shared/models';
import { AuthService } from '../../core/services/auth.service';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-messaging',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './messaging.component.html',
  styleUrls: ['./messaging.component.scss']
})
export class MessagingComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesScrollContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  conversations: Conversation[] = [];
  filteredConversations: Conversation[] = [];
  selectedConversation: Conversation | null = null;
  messages: Message[] = [];
  newMessageText = '';
  searchQuery = '';
  loadingConversations = true;
  loadingMessages = false;
  isSending = false;

  /** Images choisies avant l'envoi (aperçu local) */
  pendingImages: { file: File; preview: string }[] = [];
  readonly maxImages = MAX_MESSAGE_IMAGES;
  /** URL locales des images reçues (chargées avec le jeton) */
  imageUrls: Record<string, string> = {};
  private loadingImages = new Set<string>();

  /** Modification d'un de mes messages */
  editingId: string | null = null;
  editText = '';

  currentUserId = 'user_1';
  private shouldScrollToBottom = false;
  private subs = new Subscription();

  constructor(
    private messagingService: MessagingService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    if (this.authService.currentUser) {
      this.currentUserId = this.authService.currentUser.id;
    }

    this.subs.add(
      this.messagingService.conversations$.subscribe(list => {
        this.conversations = list;
        this.applyFilter();
        // Garde la conversation ouverte à jour (non lus, dernier message)
        if (this.selectedConversation) {
          this.selectedConversation = list.find(c => c.id === this.selectedConversation!.id) ?? this.selectedConversation;
        }
      })
    );

    // « Contacter » depuis une annonce ou un événement : ouvre (ou crée) la conversation correspondante
    const query = this.route.snapshot.queryParamMap;
    const recipient = query.get('recipient');
    if (recipient && recipient !== this.currentUserId) {
      const listingId = query.get('listing');
      const eventId = query.get('event');
      const sittingId = query.get('babysitting');
      const type = listingId ? 'MARKETPLACE' : eventId ? 'EVENT' : sittingId ? 'BABYSITTING' : 'DIRECT';
      this.messagingService.startConversation(recipient, type, query.get('title') ?? undefined,
        listingId ?? eventId ?? sittingId ?? undefined)
        .subscribe({
          next: id => this.router.navigate(['/app/messages', id], { replaceUrl: true }).then(() => this.reloadAndSelect(id)),
          error: err => this.toast.error(this.messagingService.errorMessage(err, 'Impossible de démarrer la conversation.'))
        });
    }

    // Chargement initial depuis le service Messagerie
    this.messagingService.refreshConversations().subscribe({
      next: () => {
        this.loadingConversations = false;
        this.checkRouteParam();
      },
      error: err => {
        this.loadingConversations = false;
        this.toast.error(this.messagingService.errorMessage(err, 'Impossible de charger vos conversations.'));
      }
    });

    // Rafraîchissement : liste toutes les 15 s, conversation ouverte toutes les 4 s
    this.subs.add(interval(15000).subscribe(() => this.messagingService.refreshConversations().subscribe({ error: () => {} })));
    this.subs.add(interval(4000).subscribe(() => this.pollOpenConversation()));

    this.subs.add(
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id && this.conversations.length > 0) {
          this.selectConversationById(id, false);
        }
      })
    );
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private checkRouteParam(): void {
    const routeId = this.route.snapshot.paramMap.get('id');
    if (routeId) {
      this.selectConversationById(routeId, false);
    } else if (!this.selectedConversation && window.innerWidth >= 768 && this.conversations.length > 0) {
      // Auto-select first conversation on desktop
      this.selectConversation(this.conversations[0], false);
    }
  }

  private selectConversationById(convoId: string, navigate = true): void {
    const found = this.conversations.find(c => c.id === convoId);
    if (found) {
      this.selectConversation(found, navigate);
    }
  }

  selectConversation(convo: Conversation, navigate = true): void {
    this.selectedConversation = convo;
    this.loadingMessages = true;

    if (convo.unreadCount > 0) {
      this.messagingService.markAsRead(convo.id).subscribe();
    }

    if (navigate) {
      this.router.navigate(['/app/messages', convo.id]);
    }

    this.messagingService.getMessages(convo.id).subscribe({
      next: msgs => {
        this.messages = msgs;
        this.updateParticipantNames(convo, msgs);
        this.loadingMessages = false;
        this.shouldScrollToBottom = true;
      },
      error: err => {
        this.loadingMessages = false;
        this.toast.error(this.messagingService.errorMessage(err, 'Impossible de charger les messages.'));
      }
    });
  }

  private reloadAndSelect(id: string): void {
    this.messagingService.refreshConversations().subscribe(() => {
      this.loadingConversations = false;
      this.selectConversationById(id, false);
    });
  }

  /** Nouveaux messages de la conversation ouverte (réponse de l'autre parent). */
  private pollOpenConversation(): void {
    const convo = this.selectedConversation;
    if (!convo || this.loadingMessages || this.isSending) return;
    this.messagingService.getMessages(convo.id).subscribe({
      next: msgs => {
        if (this.selectedConversation?.id !== convo.id) return;
        // Signature : nouveaux messages, mais aussi messages modifiés ou supprimés par l'autre parent
        const signature = (list: Message[]) => list.map(m => `${m.id}:${m.editedAt?.getTime() ?? 0}:${m.deleted ? 1 : 0}`).join('|');
        if (signature(msgs) !== signature(this.messages) && !this.editingId) {
          this.messages = msgs;
          this.updateParticipantNames(convo, msgs);
          this.shouldScrollToBottom = true;
          this.messagingService.markAsRead(convo.id).subscribe();
        }
      },
      error: () => {}
    });
  }

  backToList(): void {
    this.selectedConversation = null;
    this.router.navigate(['/app/messages']);
  }

  applyFilter(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredConversations = [...this.conversations];
      return;
    }

    this.filteredConversations = this.conversations.filter(c => {
      const otherUser = this.getOtherParticipant(c);
      const nameMatch = otherUser.name.toLowerCase().includes(q);
      const msgMatch = c.lastMessage?.content.toLowerCase().includes(q) ?? false;
      return nameMatch || msgMatch;
    });
  }

  /** Le nom réel d'un participant est connu dès qu'il a écrit (nom issu de son jeton, enregistré par le service). */
  private updateParticipantNames(convo: Conversation, msgs: Message[]): void {
    for (const p of convo.participants) {
      const named = msgs.find(m => m.senderId === p.userId && m.senderName && m.senderName !== 'Parent');
      if (named && p.userId !== this.currentUserId) p.name = named.senderName;
    }
  }

  getOtherParticipant(convo: Conversation): ConversationParticipant {
    const other = convo.participants.find(p => p.userId !== this.currentUserId);
    return other || convo.participants[0] || { userId: '', name: 'Utilisateur', isOnline: false };
  }

  sendMessage(): void {
    const text = this.newMessageText.trim();
    if ((!text && this.pendingImages.length === 0) || !this.selectedConversation || this.isSending) return;

    const convoId = this.selectedConversation.id;
    this.isSending = true;
    const files = this.pendingImages.map(p => p.file);

    // Les images sont téléversées une par une, puis le message est envoyé avec leurs identifiants
    const upload$ = files.length
      ? from(files).pipe(concatMap(f => this.messagingService.uploadImage(convoId, f)), toArray())
      : of([] as string[]);
    upload$.pipe(switchMap(ids => this.messagingService.sendMessage(convoId, text, ids))).subscribe({
      next: (sent) => {
        this.messages.push(sent);
        this.newMessageText = '';
        this.clearPendingImages();
        this.isSending = false;
        this.shouldScrollToBottom = true;
      },
      error: err => {
        this.isSending = false;
        this.toast.error(this.messagingService.errorMessage(err, 'Message non envoyé.'));
      }
    });
  }

  // ------------------------------------------------------------ images
  onImagesSelected(event: globalThis.Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (this.pendingImages.length >= this.maxImages) {
        this.toast.warning(`${this.maxImages} images maximum par message.`);
        break;
      }
      const problem = this.messagingService.validateImage(file);
      if (problem) {
        this.toast.error(problem);
        continue;
      }
      this.pendingImages.push({ file, preview: URL.createObjectURL(file) });
    }
  }

  removePendingImage(index: number): void {
    URL.revokeObjectURL(this.pendingImages[index].preview);
    this.pendingImages.splice(index, 1);
  }

  private clearPendingImages(): void {
    this.pendingImages.forEach(p => URL.revokeObjectURL(p.preview));
    this.pendingImages = [];
  }

  /** URL affichable d'une image jointe (chargée à la première demande). */
  imageUrl(id: string): string | null {
    const url = this.imageUrls[id];
    if (url) return url;
    if (!this.loadingImages.has(id)) {
      this.loadingImages.add(id);
      this.messagingService.loadImage(id).subscribe({
        next: u => (this.imageUrls = { ...this.imageUrls, [id]: u }),
        error: () => this.loadingImages.delete(id),
      });
    }
    return null;
  }

  openImage(id: string): void {
    const url = this.imageUrls[id];
    if (url) window.open(url, '_blank', 'noopener');
  }

  // ------------------------------------------------- modifier / supprimer
  startEdit(msg: Message): void {
    this.editingId = msg.id;
    this.editText = msg.content;
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editText = '';
  }

  saveEdit(msg: Message): void {
    const text = this.editText.trim();
    if (!text) {
      this.toast.warning('Le message ne peut pas être vide.');
      return;
    }
    this.messagingService.editMessage(msg.id, text).subscribe({
      next: updated => {
        Object.assign(msg, { content: updated.content, editedAt: updated.editedAt });
        this.cancelEdit();
        this.toast.success('Message modifié.');
      },
      error: err => this.toast.error(this.messagingService.errorMessage(err, 'Modification impossible.'))
    });
  }

  deleteMessage(msg: Message): void {
    if (!window.confirm('Supprimer ce message pour tous les participants ?')) return;
    this.messagingService.deleteMessage(msg.id).subscribe({
      next: () => {
        Object.assign(msg, { deleted: true, content: '', attachments: [] });
        this.toast.success('Message supprimé.');
      },
      error: err => this.toast.error(this.messagingService.errorMessage(err, 'Suppression impossible.'))
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  formatTime(date: Date | string | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  formatMessageTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  getInitials(name: string): string {
    // Seulement les mots qui commencent par une lettre (« Parent (garde d'enfants) » -> « PG »)
    const words = (name || '').trim().split(/\s+/).map(w => w.replace(/^[^\p{L}]+/u, '')).filter(Boolean);
    if (words.length === 0) return '?';
    return (words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
  }
}
