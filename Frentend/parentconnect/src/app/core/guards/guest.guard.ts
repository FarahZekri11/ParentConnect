import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard preventing already-authenticated users from getting stuck in /auth pages (login, register).
 * - Allows access to anonymous visitors.
 * - Redirects logged-in users directly to /app/dashboard using UrlTree.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn) {
    return true;
  }

  // Already authenticated, forward to dashboard
  return router.createUrlTree(['/app/dashboard']);
};
