import { Routes } from '@angular/router';
export const COMMUNITY_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./community.component').then(m => m.CommunityComponent) },
  { path: 'new', loadComponent: () => import('./pages/create-post/create-post.component').then(m => m.CreatePostComponent) },
  { path: ':id', loadComponent: () => import('./pages/post-detail/post-detail.component').then(m => m.PostDetailComponent) },
];
