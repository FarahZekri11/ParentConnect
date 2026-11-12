const http = require('http');

const PORT = 8761;
const registry = new Map();

// Register MARKETPLACE-SERVICE by default
registry.set('MARKETPLACE-SERVICE', {
  app: 'MARKETPLACE-SERVICE',
  instance: [
    {
      instanceId: 'marketplace-service:3002',
      hostName: 'localhost',
      app: 'MARKETPLACE-SERVICE',
      ipAddr: '127.0.0.1',
      status: 'UP',
      port: { '$': 3002, '@enabled': 'true' },
      homePageUrl: 'http://localhost:3002/api',
      statusPageUrl: 'http://localhost:3002/api/docs',
      healthCheckUrl: 'http://localhost:3002/api/health',
      lastUpdatedTimestamp: Date.now()
    }
  ]
});

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url;

  // Eureka Apps JSON endpoint
  if (url === '/eureka/apps' || url === '/eureka/apps/') {
    const appsList = Array.from(registry.values());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      applications: {
        versions__delta: '1',
        apps__hashcode: 'UP_' + appsList.length,
        application: appsList
      }
    }));
    return;
  }

  // Handle registration POST /eureka/apps/{appName}
  if (req.method === 'POST' && url.startsWith('/eureka/apps/')) {
    const appName = url.replace('/eureka/apps/', '').split('/')[0].toUpperCase();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const inst = parsed.instance || {
          instanceId: `${appName}:3002`,
          hostName: 'localhost',
          app: appName,
          status: 'UP',
          port: { '$': 3002 }
        };
        registry.set(appName, { app: appName, instance: [inst] });
        console.log(`[Eureka Server] Registered application: ${appName}`);
      } catch (e) {
        registry.set(appName, { app: appName, instance: [{ app: appName, status: 'UP' }] });
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }

  // Eureka Dashboard HTML
  if (url === '/' || url === '/eureka') {
    const appsList = Array.from(registry.values());
    const rows = appsList.map(a => `
      <tr style="border-bottom:1px solid #ddd;padding:8px;">
        <td style="padding:10px;font-weight:bold;color:#2c3e50;">${a.app}</td>
        <td style="padding:10px;"><span style="background:#27ae60;color:white;padding:3px 8px;border-radius:4px;font-size:12px;">UP (1)</span></td>
        <td style="padding:10px;">${a.instance[0]?.statusPageUrl || 'http://localhost:3002/api/docs'}</td>
      </tr>
    `).join('');

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Spring Cloud Eureka Discovery Server</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; margin:0; padding:40px; }
          .card { background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); padding: 24px; max-width: 900px; margin: 0 auto; }
          h1 { color: #1e293b; margin-top: 0; display:flex; align-items:center; gap:10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: left; padding: 10px; background: #f1f5f9; color: #475569; font-size: 13px; text-transform: uppercase; }
          .badge { background: #3b82f6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1><span>🌐</span> Spring Cloud Eureka Discovery Server</h1>
          <p style="color:#64748b;">Centralized Service Registry for ParentConnect Microservices Architecture</p>
          <div style="margin:20px 0;padding:12px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;color:#1e40af;">
            <strong>Statut du serveur:</strong> Actif et opérationnel sur le port <strong>8761</strong>
          </div>
          <h3>Instances actuellement enregistrées avec Eureka</h3>
          <table>
            <thead>
              <tr><th>Application</th><th>Status</th><th>URL Information</th></tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[Eureka Discovery Server] Running on http://localhost:${PORT}`);
});
