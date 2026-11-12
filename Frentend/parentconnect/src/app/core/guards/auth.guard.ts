import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Route protection guard for authenticated pages (/app/**).
 * - Allows access if user is logged in.
 * - Redirects cleanly to /auth/login with returnUrl if unauthenticated,
 *   using UrlTree to preserve browser history integrity.
 */
export const authGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn) {
    return true;
  }

  // Preserve target URL when attempting direct access to protected page
  const hasReturnUrl = state.url && state.url !== '/' && state.url !== '/app' && state.url !== '/app/dashboard';
  return router.createUrlTree(['/auth/login'], {
    queryParams: hasReturnUrl ? { returnUrl: state.url } : undefined
  });
};
