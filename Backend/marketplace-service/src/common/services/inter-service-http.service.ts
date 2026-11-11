import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';

export interface InterServiceRequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  bearerToken?: string;
}

/**
 * Service pour les appels HTTP inter-services avec propagation automatique
 * du jeton Keycloak (Authorization: Bearer <token>) pour préserver la sécurité de bout en bout.
 */
@Injectable()
export class InterServiceHttpService {
  private readonly logger = new Logger(InterServiceHttpService.name);

  async call<T = any>(options: InterServiceRequestOptions): Promise<T> {
    const { url, method = 'GET', headers = {}, body, bearerToken } = options;
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    };

    // Propagation systématique du token Bearer reçu
    if (bearerToken) {
      const cleanToken = bearerToken.startsWith('Bearer ')
        ? bearerToken
        : `Bearer ${bearerToken}`;
      requestHeaders['Authorization'] = cleanToken;
    }

    const payload = body ? JSON.stringify(body) : null;
    if (payload) {
      requestHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    return new Promise((resolve, reject) => {
      const req = client.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers: requestHeaders,
        },
        (res) => {
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            const statusCode = res.statusCode || 500;
            if (statusCode >= 200 && statusCode < 300) {
              try {
                const parsed = responseData ? JSON.parse(responseData) : null;
                resolve(parsed as T);
              } catch {
                resolve(responseData as any);
              }
            } else {
              this.logger.error(
                `Inter-service call to ${url} failed with status ${statusCode}: ${responseData}`,
              );
              reject(
                new Error(
                  `Inter-service call failed: HTTP ${statusCode} - ${responseData}`,
                ),
              );
            }
          });
        },
      );

      req.on('error', (err) => {
        this.logger.error(`Inter-service network error to ${url}: ${err.message}`);
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }
}
