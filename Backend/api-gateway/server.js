const http = require('http');

const PORT = 8080;
const MARKETPLACE_URL = 'http://localhost:3002';
const KEYCLOAK_URL = 'http://localhost:8180';
const REALM = 'parentconnect';

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4 !== 0) payload += '=';
    const json = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function keycloakGatewayAuth(req) {
  const method = req.method.toUpperCase();
  const path = req.url.split('?')[0];

  // Public GET endpoints
  if (method === 'GET' && (path === '/api/listings' || path.startsWith('/api/listings/'))) {
    return { authorized: true };
  }

  // All write endpoints require valid Keycloak token
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authorized: false, status: 401, error: 'Unauthorized: Bearer token is missing. Please provide a valid Keycloak JWT.' };
  }

  const token = authHeader.substring(7);
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { authorized: false, status: 401, error: 'Unauthorized: Malformed or unreadable Keycloak token.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return { authorized: false, status: 401, error: 'Unauthorized: Keycloak token has expired.' };
  }

  const userId = payload.sub || '';
  const email = payload.email || '';
  const username = payload.preferred_username || '';
  const roles = payload.realm_access?.roles || [];

  return { authorized: true, user: { userId, email, username, roles } };
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-user-email, x-user-roles');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url;

  // Root Dashboard
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ParentConnect — Spring Cloud API Gateway</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 40px; }
          .card { background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 24px; max-width: 900px; margin: 0 auto; }
          h1 { color: #1e293b; margin-top: 0; display:flex; align-items:center; gap:10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { text-align: left; padding: 10px; background: #f1f5f9; color: #475569; font-size: 13px; text-transform: uppercase; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
          .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
          .badge-green { background: #dcfce7; color: #15803d; }
          .badge-blue { background: #dbeafe; color: #1d4ed8; }
          .badge-orange { background: #ffedd5; color: #c2410c; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1><span>🛡️</span> ParentConnect — API Gateway</h1>
          <p style="color:#64748b;">Point d'entrée unique sécurisé avec Keycloak OAuth2 / OIDC & Token Relay</p>
          
          <div style="margin:20px 0;padding:12px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;color:#15803d;">
            <strong>Statut de la Gateway :</strong> En ligne sur le port <strong>8080</strong>
          </div>

          <h3>Table de Routage & Politiques de Sécurité Keycloak</h3>
          <table>
            <thead>
              <tr><th>Route Gateway</th><th>Méthode</th><th>Service Cible</th><th>Politique Keycloak</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><code>/api/listings</code></td>
                <td><span class="badge badge-blue">GET</span></td>
                <td>Marketplace Microservice (3002)</td>
                <td><span class="badge badge-green">Public (PermitAll)</span></td>
              </tr>
              <tr>
                <td><code>/api/listings/:id</code></td>
                <td><span class="badge badge-blue">GET</span></td>
                <td>Marketplace Microservice (3002)</td>
                <td><span class="badge badge-green">Public (PermitAll)</span></td>
              </tr>
              <tr>
                <td><code>/api/listings</code></td>
                <td><span class="badge badge-orange">POST</span></td>
                <td>Marketplace Microservice (3002)</td>
                <td><span class="badge badge-orange">Token Keycloak Obligatoire</span></td>
              </tr>
              <tr>
                <td><code>/api/listings/:id/borrow</code></td>
                <td><span class="badge badge-orange">POST</span></td>
                <td>Marketplace Microservice (3002)</td>
                <td><span class="badge badge-orange">Token Keycloak Obligatoire</span></td>
              </tr>
              <tr>
                <td><code>/eureka/**</code></td>
                <td><span class="badge badge-blue">GET</span></td>
                <td>Eureka Server (8761)</td>
                <td><span class="badge badge-green">Public</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Routing: /api/listings/** -> Marketplace
  if (url.startsWith('/api/listings')) {
    const authResult = keycloakGatewayAuth(req);
    if (!authResult.authorized) {
      res.writeHead(authResult.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        statusCode: authResult.status,
        error: 'Unauthorized',
        message: authResult.error,
        keycloakRealm: REALM
      }));
      return;
    }

    const headers = { ...req.headers };
    delete headers['host'];
    if (authResult.user) {
      headers['x-user-id'] = authResult.user.userId;
      headers['x-user-email'] = authResult.user.email;
      headers['x-user-roles'] = JSON.stringify(authResult.user.roles);
    }

    const proxyReq = http.request(
      `${MARKETPLACE_URL}${url}`,
      {
        method: req.method,
        headers
      },
      proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Eureka proxy
  if (url.startsWith('/eureka')) {
    const proxyReq = http.request(
      `http://localhost:8761${url}`,
      { method: req.method, headers: req.headers },
      proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
    });
    req.pipe(proxyReq);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', message: 'No route configured on API Gateway' }));
});

server.listen(PORT, () => {
  console.log(`[API Gateway] Running on http://localhost:${PORT}`);
  console.log(`[API Gateway] Keycloak Realm: ${REALM} (${KEYCLOAK_URL})`);
  console.log(`[API Gateway] Routing /api/listings -> ${MARKETPLACE_URL}/api/listings`);
});
