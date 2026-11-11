import { Routes } from '@angular/router';

export const NEIGHBORHOOD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./neighborhood.component').then(m => m.NeighborhoodComponent)
  }
];
