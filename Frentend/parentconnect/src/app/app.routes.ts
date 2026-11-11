import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Public Landing / Home
  { path: '', loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent) },

  // Authentication routes (/auth/login, /auth/register, /auth/forgot-password)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },

  // Protected App Shell (/app/**)
  {
    path: 'app',
    loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',   loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'neighborhood', loadChildren: () => import('./features/neighborhood/neighborhood.routes').then(m => m.NEIGHBORHOOD_ROUTES) },
      { path: 'marketplace', loadChildren: () => import('./features/marketplace/marketplace.routes').then(m => m.MARKETPLACE_ROUTES) },
      { path: 'babysitting', loadChildren: () => import('./features/babysitting/babysitting.routes').then(m => m.BABYSITTING_ROUTES) },
      { path: 'community',   loadChildren: () => import('./features/community/community.routes').then(m => m.COMMUNITY_ROUTES) },
      { path: 'events',      loadChildren: () => import('./features/events/events.routes').then(m => m.EVENTS_ROUTES) },
      { path: 'messages',    loadChildren: () => import('./features/messaging/messaging.routes').then(m => m.MESSAGING_ROUTES) },
      { path: 'family',      loadComponent: () => import('./features/family/family.component').then(m => m.FamilyComponent) },
      { path: 'profile',     loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent) },
    ]
  },

  // Friendly top-level aliases redirecting to protected /app/* routes
  { path: 'dashboard',   redirectTo: 'app/dashboard', pathMatch: 'full' },
  { path: 'neighborhood', redirectTo: 'app/neighborhood', pathMatch: 'prefix' },
  { path: 'marketplace', redirectTo: 'app/marketplace', pathMatch: 'prefix' },
  { path: 'babysitting', redirectTo: 'app/babysitting', pathMatch: 'prefix' },
  { path: 'community',   redirectTo: 'app/community', pathMatch: 'prefix' },
  { path: 'events',      redirectTo: 'app/events', pathMatch: 'prefix' },
  { path: 'messages',    redirectTo: 'app/messages', pathMatch: 'prefix' },
  { path: 'family',      redirectTo: 'app/family', pathMatch: 'full' },
  { path: 'profile',     redirectTo: 'app/profile', pathMatch: 'full' },

  // Fallback
  { path: '**', redirectTo: '' }
];
