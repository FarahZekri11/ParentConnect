import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Accès réservé au rôle ADMIN (confort d'interface : la Gateway et chaque service vérifient eux-mêmes le rôle).
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn && auth.hasRole('ADMIN') ? true : router.createUrlTree(['/app/dashboard']);
};
