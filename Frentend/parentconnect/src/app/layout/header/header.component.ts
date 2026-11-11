import { Component, EventEmitter, HostListener, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { BackgroundService } from '../../core/services/background.service';
import { User } from '../../shared/models';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  @Output() menuToggled = new EventEmitter<void>();
  readonly bgService = inject(BackgroundService);
  currentUser: User | null = null;
  showUserMenu = false;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(u => this.currentUser = u);
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
  }

  logout() {
    this.authService.logout();
    this.showUserMenu = false;
  }
}
