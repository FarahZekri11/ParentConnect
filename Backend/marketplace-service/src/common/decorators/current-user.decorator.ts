import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedUser {
  userId: string;
  username?: string;
  email?: string;
  roles?: string[];
  isKeycloak?: boolean;
  /** Nom affiché (claim « name » du token, relayé par la Gateway en X-User-Display-Name) */
  displayName?: string;
}

function decodeHeader(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    // La Gateway encode au format formulaire (URLEncoder) : « + » représente une espace
    return decodeURIComponent(value.replace(/\+/g, ' ')).trim().slice(0, 120) || undefined;
  } catch {
    return undefined;
  }
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    // 1. Support Keycloak JWT, standard JWT, and Gateway forwarded headers
    const userId =
      request.user?.sub ||
      request.user?.userId ||
      request.user?.id ||
      (request.headers['x-user-id'] as string);

    const email =
      request.user?.email || (request.headers['x-user-email'] as string);

    const username =
      request.user?.preferred_username ||
      request.user?.username ||
      (request.headers['x-user-name'] as string) ||
      'Parent';

    // 2. Extract roles from Keycloak realm_access, client resource_access, or direct header
    const rolesHeader = request.headers['x-user-roles'] as string;
    const headerRoles = rolesHeader
      ? rolesHeader.split(',').map((r) => r.trim().toUpperCase())
      : [];

    const keycloakRealmRoles = request.user?.realm_access?.roles || [];
    const keycloakClientRoles =
      request.user?.resource_access?.['marketplace-service']?.roles || [];
    const directRoles = request.user?.roles || [];

    const combinedRoles = Array.from(
      new Set([
        ...headerRoles,
        ...keycloakRealmRoles,
        ...keycloakClientRoles,
        ...directRoles,
        'USER', // Default fallback role
      ]),
    );

    const user: AuthenticatedUser | null = userId
      ? {
          userId,
          username,
          email,
          roles: combinedRoles,
          displayName:
            decodeHeader(request.headers['x-user-display-name']) ||
            (typeof request.user?.name === 'string' ? request.user.name.slice(0, 120) : undefined),
          isKeycloak: !!request.user?.iss || !!request.headers['x-keycloak-auth'],
        }
      : null;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
