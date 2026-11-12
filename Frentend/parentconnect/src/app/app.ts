import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ToastService } from './shared/services/toast.service';
import { ToastMessage } from './shared/models';

@Component({
  // Angular 22 : OnPush par défaut. Ce composant met à jour ses champs après des appels
  // asynchrones (HTTP, timers) : Eager rétablit le rafraîchissement automatique.
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  template: `
    <router-outlet />
    <!-- Toast Container -->
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      <div *ngFor="let toast of toasts"
           class="toast toast-{{toast.type}}"
           role="status"
           tabindex="0"
           (click)="removeToast(toast.id)"
           (keydown.enter)="removeToast(toast.id)">
        <span class="material-icons-round toast-icon" aria-hidden="true">{{getIcon(toast.type)}}</span>
        <span class="toast-message">{{toast.message}}</span>
        <span class="material-icons-round" style="font-size:16px;opacity:0.6" aria-hidden="true">close</span>
      </div>
    </div>
  `,
  styles: [`:host { display: block; }`]
})
export class App implements OnInit {
  toasts: ToastMessage[] = [];
  constructor(private toastService: ToastService) {}
  ngOnInit() { this.toastService.toasts$.subscribe(t => this.toasts = t); }
  removeToast(id: string) { this.toastService.remove(id); }
  getIcon(type: string): string {
    const map: Record<string,string> = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    return map[type] ?? 'info';
  }
}
