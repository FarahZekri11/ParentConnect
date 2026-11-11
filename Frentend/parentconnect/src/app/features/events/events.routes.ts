import { Routes } from '@angular/router';
export const EVENTS_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./events.component').then(m => m.EventsComponent) },
  { path: 'new', loadComponent: () => import('./pages/create-event/create-event.component').then(m => m.CreateEventComponent) },
  { path: ':id', loadComponent: () => import('./pages/event-detail/event-detail.component').then(m => m.EventDetailComponent) },
];
