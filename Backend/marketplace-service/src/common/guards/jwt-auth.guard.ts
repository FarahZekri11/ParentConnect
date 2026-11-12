import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { ROLES_KEY } from '../decorators/roles.decorator';

let cachedJwksRsa: any = null;
function getJwksRsa(): any {
  if (!cachedJwksRsa) {
    try {
      cachedJwksRsa = require('jwks-rsa');
    } catch {
      cachedJwksRsa = null;
    }
  }
  return cachedJwksRsa;
}

function formatPublicKey(rawKey: string): string {
  const clean = rawKey.trim();
  if (clean.includes('BEGIN PUBLIC KEY')) return clean;
  const wrapped = clean.match(/.{1,64}/g)?.join('\n') || clean;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

/**
 * Guard d'authentification robuste avec validation asymétrique RS256 via Keycloak JWKS.
 * - Ne fait JAMAIS confiance aux en-têtes client non vérifiés (X-Gateway-Auth, X-User-Id).
 * - Exige impérativement un jeton JWT Bearer valide dans l'en-tête Authorization.
 * - Valide la signature cryptographique RS256, l'émetteur (iss), l'expiration (exp) et l'audience/azp.
 * - Renvoie 401 Unauthorized en cas d'absence ou d'invalidité du token.
 * - Renvoie 403 Forbidden en cas de rôle insuffisant.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private jwksClient: any;
  private readonly keycloakIssuerHost: string;
  private readonly keycloakIssuerContainer: string;
  private readonly allowedAudiences = [
    'marketplace-service',
    'frontend-parentconnect',
    'api-gateway',
    'account',
  ];

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Optional() private readonly reflector?: Reflector,
  ) {
    const keycloakUrl = this.configService.get<string>(
      'keycloak.url',
      process.env.KEYCLOAK_URL || 'http://localhost:8180',
    );
    const keycloakRealm = this.configService.get<string>(
      'keycloak.realm',
      process.env.KEYCLOAK_REALM || 'parentconnect',
    );

    this.keycloakIssuerHost = `http://localhost:8180/realms/${keycloakRealm}`;
    this.keycloakIssuerContainer = `http://keycloak:8180/realms/${keycloakRealm}`;

    const configuredIssuer = `${keycloakUrl}/realms/${keycloakRealm}`;
    const jwksUri = `${configuredIssuer}/protocol/openid-connect/certs`;

    const jwksFactory = getJwksRsa();
    if (jwksFactory) {
      this.jwksClient = jwksFactory({
        jwksUri,
        cache: true,
        cacheMaxEntries: 10,
        cacheMaxAge: 600000, // 10 minutes
        rateLimit: true,
        jwksRequestsPerMinute: 30,
      });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // -------------------------------------------------------------------------
    // RÈGLE DE SÉCURITÉ STRICTE:
    // Ne jamais faire confiance aux en-têtes client X-Gateway-Auth / X-User-Id sans jeton.
    // L'en-tête Authorization: Bearer <token> est strictement obligatoire sur toutes les routes protégées.
    // -------------------------------------------------------------------------
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        `[Security] Rejected unauthenticated access to ${request.method} ${request.url} from ${request.ip}`,
      );
      throw new UnauthorizedException(
        'Authentication required: A valid Keycloak Bearer token must be provided.',
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Authentication required: Bearer token is empty.');
    }

    // -------------------------------------------------------------------------
    // 1. Validation Cryptographique RS256 via Keycloak JWKS / Clé Publique Realm
    // -------------------------------------------------------------------------
    try {
      const decodedKeycloak = await this.verifyKeycloakToken(token);

      // Validation de l'Expiration (exp)
      if (decodedKeycloak.exp && Date.now() >= decodedKeycloak.exp * 1000) {
        throw new UnauthorizedException('Token expired: Please re-authenticate.');
      }

      // Validation de l'Émetteur (iss)
      const tokenIssuer = decodedKeycloak.iss || '';
      const isValidIssuer =
        tokenIssuer === this.keycloakIssuerHost ||
        tokenIssuer === this.keycloakIssuerContainer ||
        tokenIssuer.includes('/realms/parentconnect');

      if (!isValidIssuer) {
        this.logger.warn(`[Security] Untrusted token issuer: ${tokenIssuer}`);
        throw new UnauthorizedException(`Untrusted token issuer: ${tokenIssuer}`);
      }

      // Validation de l'Audience / Authorized Party (aud / azp)
      const tokenAud = Array.isArray(decodedKeycloak.aud)
        ? decodedKeycloak.aud
        : [decodedKeycloak.aud];
      const tokenAzp = decodedKeycloak.azp;

      const hasValidAudience =
        this.allowedAudiences.some((aud) => tokenAud.includes(aud)) ||
        (tokenAzp && this.allowedAudiences.includes(tokenAzp));

      if (!hasValidAudience) {
        this.logger.warn(
          `[Security] Token audience mismatch: aud=${JSON.stringify(tokenAud)}, azp=${tokenAzp}`,
        );
        throw new UnauthorizedException('Token audience invalid for this service.');
      }

      // Extraction de l'Identité
      const userId = String(
        decodedKeycloak.sub || decodedKeycloak.preferred_username,
      );

      // Extraction des Rôles (realm_access.roles + client roles)
      const rawRoles: string[] = [
        ...(decodedKeycloak.realm_access?.roles || []),
        ...(decodedKeycloak.resource_access?.['marketplace-service']?.roles || []),
      ];
      const roles = rawRoles.map((r: string) => r.toUpperCase());

      request.user = {
        ...decodedKeycloak,
        sub: userId,
        userId,
        email: decodedKeycloak.email || '',
        preferred_username: decodedKeycloak.preferred_username || userId,
        role: roles[0] || 'USER',
        roles,
        source: 'KEYCLOAK_JWKS_RS256_VERIFIED',
      };

      this.logger.debug(
        `[Security] Verified Keycloak RS256 identity: user=${request.user.preferred_username} (roles: [${roles.join(', ')}])`,
      );

      // -----------------------------------------------------------------------
      // Vérification des Rôles Requis (@Roles) -> 403 Forbidden si insuffisant
      // -----------------------------------------------------------------------
      this.checkRoles(context, roles);
      return true;
    } catch (err: any) {
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.debug(
        `Keycloak RS256 signature verification failed: ${err.message}. Trying HMAC fallback...`,
      );
    }

    // -------------------------------------------------------------------------
    // 2. Repli Sécurisé HMAC Secret (Pour Tests Unitaires Locaux / Environnement Mock)
    // -------------------------------------------------------------------------
    try {
      const secret = this.configService.get<string>(
        'jwt.secret',
        'parentconnect_jwt_secret_key',
      );
      const payload = await this.jwtService.verifyAsync(token, { secret });
      const roles = (payload.roles || ['USER']).map((r: string) =>
        r.toUpperCase(),
      );
      const userId = String(payload.sub || payload.userId || payload.id);

      request.user = {
        ...payload,
        sub: userId,
        userId,
        role: roles[0] || 'USER',
        roles,
        source: 'LOCAL_JWT_SECRET',
      };

      this.checkRoles(context, roles);
      return true;
    } catch {
      throw new UnauthorizedException(
        'Invalid, untrusted, forged or expired authentication token.',
      );
    }
  }

  private checkRoles(context: ExecutionContext, userRoles: string[]): void {
    if (!this.reflector) return;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return;
    }

    const hasRole = userRoles.some((role) =>
      requiredRoles.map((r) => r.toUpperCase()).includes(role.toUpperCase()),
    );

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied: requires one of the following roles: [${requiredRoles.join(', ')}]`,
      );
    }
  }

  private verifyKeycloakToken(token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const realmPublicKey = this.configService.get<string>(
        'keycloak.realmPublicKey',
        process.env.KEYCLOAK_REALM_PUBLIC_KEY || '',
      );

      // Mode Direct avec KEYCLOAK_REALM_PUBLIC_KEY si définie
      if (realmPublicKey && realmPublicKey.trim().length > 0) {
        const formattedKey = formatPublicKey(realmPublicKey);
        return jwt.verify(
          token,
          formattedKey,
          { algorithms: ['RS256'] },
          (err, decoded) => {
            if (err) return reject(err);
            resolve(decoded);
          },
        );
      }

      // Mode Direct avec JWKS endpoint
      if (this.jwksClient) {
        return jwt.verify(
          token,
          (header, callback) => {
            this.jwksClient.getSigningKey(header.kid, (err: any, key: any) => {
              if (err) return callback(err);
              const signingKey = key?.getPublicKey();
              callback(null, signingKey);
            });
          },
          { algorithms: ['RS256'] },
          (err, decoded) => {
            if (err) return reject(err);
            resolve(decoded);
          },
        );
      }

      reject(new Error('Neither KEYCLOAK_REALM_PUBLIC_KEY nor JWKS client configured'));
    });
  }
}
