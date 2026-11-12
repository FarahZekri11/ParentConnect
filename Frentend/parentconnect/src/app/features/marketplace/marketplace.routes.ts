import { Routes } from '@angular/router';
export const MARKETPLACE_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./marketplace.component').then(m => m.MarketplaceComponent) },
  { path: 'new',      loadComponent: () => import('./pages/create-listing/create-listing.component').then(m => m.CreateListingComponent) },
  { path: 'my-listings', loadComponent: () => import('./pages/my-listings/my-listings.component').then(m => m.MyListingsComponent) },
  { path: 'favorites',   loadComponent: () => import('./pages/favorites/favorites.component').then(m => m.FavoritesComponent) },
  { path: ':id',      loadComponent: () => import('./pages/listing-detail/listing-detail.component').then(m => m.ListingDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./pages/create-listing/create-listing.component').then(m => m.CreateListingComponent) },
];
