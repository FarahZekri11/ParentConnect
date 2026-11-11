import { Routes } from '@angular/router';
export const BABYSITTING_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./babysitting.component').then(m => m.BabysittingComponent) },
  { path: 'new-request', loadComponent: () => import('./pages/new-request/new-request.component').then(m => m.NewRequestComponent) },
  { path: 'my-bookings', loadComponent: () => import('./pages/my-bookings/my-bookings.component').then(m => m.MyBookingsComponent) },
  { path: ':id', loadComponent: () => import('./pages/babysitter-profile/babysitter-profile.component').then(m => m.BabysitterProfileComponent) },
];
