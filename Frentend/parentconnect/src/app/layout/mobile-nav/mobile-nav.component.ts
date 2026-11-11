import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './mobile-nav.component.html',
  styleUrls: ['./mobile-nav.component.scss']
})
export class MobileNavComponent {
  navItems = [
    { label: 'Accueil',     icon: 'home',        route: '/app/dashboard' },
    { label: 'Marché',      icon: 'storefront',  route: '/app/marketplace' },
    { label: 'Garde',       icon: 'child_care',  route: '/app/babysitting' },
    { label: 'Communauté',  icon: 'forum',       route: '/app/community' },
    { label: 'Messages',    icon: 'chat_bubble', route: '/app/messages' },
  ];
}
