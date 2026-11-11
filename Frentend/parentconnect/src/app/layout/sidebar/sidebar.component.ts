import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { User } from '../../shared/models';

export interface NavItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
}

@Component({
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
      route: '/app/messages',
      badge: 3
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

  constructor(private authService: AuthService) {
    this.authService.currentUser$.subscribe(u => this.currentUser = u);
  }

  getInitials(): string {
    if (!this.currentUser) return '?';
    return (this.currentUser.firstName[0] + this.currentUser.lastName[0]).toUpperCase();
  }

  logout(): void {
    this.authService.logout();
  }
}
