import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MessagingService } from './services/messaging.service';
import { Conversation, Message, ConversationParticipant } from '../../shared/models';
import { AuthService } from '../../core/services/auth.service';

@Component({
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

  currentUserId = 'user_1';
  private shouldScrollToBottom = false;
  private subs = new Subscription();

  constructor(
    private messagingService: MessagingService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.authService.currentUser) {
      this.currentUserId = this.authService.currentUser.id;
    }

    this.subs.add(
      this.messagingService.conversations$.subscribe(list => {
        this.conversations = list;
        this.applyFilter();
        this.loadingConversations = false;

        // If route has param or one needs to be selected
        this.checkRouteParam();
      })
    );

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

    this.messagingService.getMessages(convo.id).subscribe(msgs => {
      this.messages = msgs;
      this.loadingMessages = false;
      this.shouldScrollToBottom = true;
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

  getOtherParticipant(convo: Conversation): ConversationParticipant {
    const other = convo.participants.find(p => p.userId !== this.currentUserId);
    return other || convo.participants[0] || { userId: '', name: 'Utilisateur', isOnline: false };
  }

  sendMessage(): void {
    const text = this.newMessageText.trim();
    if (!text || !this.selectedConversation || this.isSending) return;

    const convoId = this.selectedConversation.id;
    this.isSending = true;
    const currentUserName = this.authService.currentUser
      ? `${this.authService.currentUser.firstName} ${this.authService.currentUser.lastName}`
      : 'Farah Zekri';

    this.messagingService.sendMessage(convoId, text, this.currentUserId, currentUserName).subscribe({
      next: (sent) => {
        this.messages.push(sent);
        this.newMessageText = '';
        this.isSending = false;
        this.shouldScrollToBottom = true;
      },
      error: () => {
        this.isSending = false;
      }
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
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
}
