import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, inject, ChangeDetectionStrategy } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { AppNotification, MessagingService } from '../../features/messaging/services/messaging.service';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BackgroundService } from '../../core/services/background.service';
import { User } from '../../shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Output() menuToggled = new EventEmitter<void>();
  readonly bgService = inject(BackgroundService);
  currentUser: User | null = null;
  showUserMenu = false;

  /** Notifications du service Messagerie (inscriptions, gardes, nouveaux voisins...) */
  readonly messagingService = inject(MessagingService);
  notifications: AppNotification[] = [];
  unreadNotifications = 0;
  showNotifications = false;
  private poll?: Subscription;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(u => this.currentUser = u);
    this.refreshUnread();
    this.poll = interval(30000).subscribe(() => this.refreshUnread());
  }

  ngOnDestroy() {
    this.poll?.unsubscribe();
  }

  refreshUnread() {
    if (!this.currentUser) return;
    this.messagingService.getUnreadNotificationCount().subscribe(n => this.unreadNotifications = n);
  }

  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
    this.showUserMenu = false;
    if (this.showNotifications) {
      this.messagingService.getNotifications().subscribe({
        next: res => {
          this.notifications = res.items.slice(0, 15);
          this.unreadNotifications = res.unread;
        },
        error: () => this.notifications = []
      });
    }
  }

  markAllRead() {
    this.messagingService.markAllNotificationsRead().subscribe(() => {
      this.notifications = this.notifications.map(n => ({ ...n, read: true }));
      this.unreadNotifications = 0;
    });
  }

  notificationIcon(type: string): string {
    const icons: Record<string, string> = {
      EVENT_REGISTRATION: 'event_available', EVENT_UPDATE: 'event_busy', BOOKING_ACCEPTED: 'child_care',
      NEW_NEIGHBOR_JOINED: 'person_pin_circle', MARKETPLACE_REQUEST: 'storefront', NEW_MESSAGE: 'chat',
    };
    return icons[type] ?? 'notifications';
  }

  getInitials(): string {
    if (!this.currentUser) return '?';
    return (this.currentUser.firstName[0] + this.currentUser.lastName[0]).toUpperCase();
  }

  toggleMenu() {
    this.showUserMenu = !this.showUserMenu;
  }

  @HostListener('document:keydown.escape')
  closeMenu() {
    this.showUserMenu = false;
    this.showNotifications = false;
  }

  logout() {
    this.authService.logout();
    this.showUserMenu = false;
  }
}
