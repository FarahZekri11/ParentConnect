import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * Functional HTTP Interceptor for ParentConnect
 * - Injects Keycloak Bearer token into Authorization header
 * - Injects x-user-* identity propagation headers for Spring Cloud Gateway and microservices
 * - Intercepts 401 Unauthorized -> redirects to /login
 * - Intercepts 403 Forbidden -> warns user without logging out
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  // Do not modify Keycloak token endpoint requests
  if (req.url.includes('/protocol/openid-connect/token')) {
    return next(req);
  }

  const token = localStorage.getItem('pc_token');
  const storedUser = localStorage.getItem('pc_user');

  const headersConfig: Record<string, string> = {};

  if (token) {
    headersConfig['Authorization'] = `Bearer ${token}`;
  }

  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      if (user.id) headersConfig['x-user-id'] = user.id;
      if (user.email) headersConfig['x-user-email'] = user.email;
      if (user.role) {
        headersConfig['x-user-role'] = user.role;
        headersConfig['x-user-roles'] = user.role;
      }
    } catch {
      // ignore JSON parse error
    }
  }

  const cloned = req.clone({
    setHeaders: headersConfig,
  });

  return next(cloned).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // 401 Unauthorized: token missing, invalid, or expired -> redirect to login
        console.warn('[AuthInterceptor] 401 Unauthorized received. Redirecting to /login...');
        localStorage.removeItem('pc_token');
        localStorage.removeItem('pc_user');
        router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      } else if (error.status === 403) {
        // 403 Forbidden: insufficient role -> display access denied without logging out
        console.warn(
          '[AuthInterceptor] 403 Forbidden: Droits ou rôle insuffisants pour cette ressource.',
        );
        window.dispatchEvent(
          new CustomEvent('parentconnect:access-denied', {
            detail: {
              message: 'Accès refusé : vous ne possédez pas le rôle requis pour cette action.',
              status: 403,
            },
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
