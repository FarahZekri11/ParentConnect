import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MessagingService } from '../../features/messaging/services/messaging.service';
import { User } from '../../shared/models';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
}

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  @Input() open = true;

  currentUser: User | null = null;

  mainNav: NavItem[] = [
    {
      label: 'Accueil',
      icon: 'home',
      route: '/app/dashboard'
    },
    {
      label: 'Mon Quartier',
      icon: 'explore',
      route: '/app/neighborhood'
    },
    {
      label: 'Marketplace',
      icon: 'storefront',
      route: '/app/marketplace'
    },
    {
      label: 'Babysitting',
      icon: 'child_care',
      route: '/app/babysitting'
    },
    {
      label: 'Communauté',
      icon: 'forum',
      route: '/app/community'
    },
    {
      label: 'Événements',
      icon: 'event',
      route: '/app/events'
    },
    {
      label: 'Messages',
      icon: 'chat_bubble',
      route: '/app/messages'
    },
  ];

  secondaryNav: NavItem[] = [
    {
      label: 'Ma famille',
      icon: 'family_restroom',
      route: '/app/family'
    },
    {
      label: 'Mon profil',
      icon: 'person',
      route: '/app/profile'
    },
  ];

  constructor(private authService: AuthService, private messagingService: MessagingService) {
    this.authService.currentUser$.subscribe(u => {
      this.currentUser = u;
      // Entrée « Administration » visible uniquement pour le rôle ADMIN
      const hasAdmin = this.secondaryNav.some(i => i.route === '/app/admin');
      if (this.authService.hasRole('ADMIN') && !hasAdmin) {
        this.secondaryNav = [{ label: 'Administration', icon: 'admin_panel_settings', route: '/app/admin' }, ...this.secondaryNav];
      } else if (!this.authService.hasRole('ADMIN') && hasAdmin) {
        this.secondaryNav = this.secondaryNav.filter(i => i.route !== '/app/admin');
      }
    });
    // Badge « Messages » : nombre réel de messages non lus (service Messagerie)
    this.messagingService.getTotalUnreadCount().subscribe(count => {
      const item = this.mainNav.find(i => i.route === '/app/messages');
      if (item) item.badge = count > 0 ? count : undefined;
    });
    if (this.currentUser) {
      this.messagingService.refreshConversations().subscribe({ error: () => {} });
    }
  }

  getInitials(): string {
    if (!this.currentUser) return '?';
    return (this.currentUser.firstName[0] + this.currentUser.lastName[0]).toUpperCase();
  }

  logout(): void {
    this.authService.logout();
  }
}
