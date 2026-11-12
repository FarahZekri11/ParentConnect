// =====================================================================
// ParentConnect — préparation de l'environnement (exécuté dans un conteneur node:20-alpine par
// setup.ps1 / setup.sh : aucun outil à installer sur la machine).
//
// 1. Copie .env.example en .env (si .env n'existe pas encore)
// 2. Génère une paire de clés RSA 2048 pour le realm Keycloak "parentconnect" :
//      - KC_REALM_PRIVATE_KEY      : clé privée importée par Keycloak (jamais versionnée)
//      - KEYCLOAK_REALM_PUBLIC_KEY : clé publique lue par les microservices
//      - keys/realm-public.pem     : même clé publique au format PEM (service Messaging)
// 3. Remplace les valeurs "CHANGE_ME" par des secrets aléatoires (APP_KEY Laravel au format base64:...)
//
// Si .env existe déjà : seules les variables ajoutées depuis à .env.example y sont AJOUTÉES (secrets générés) ;
// les valeurs existantes (clés du realm, mots de passe des bases) ne sont jamais modifiées, sauf avec --force.
// =====================================================================
const crypto = require('crypto');
const fs = require('fs');

const force = process.argv.includes('--force');

if (!fs.existsSync('.env.example')) {
  console.error('[setup] .env.example introuvable : lancer ce script depuis la racine du projet.');
  process.exit(1);
}

const secret = (value) => value
  .replace(/CHANGE_ME_APP_KEY/g, () => 'base64:' + crypto.randomBytes(32).toString('base64'))
  .replace(/CHANGE_ME/g, () => crypto.randomBytes(16).toString('hex'));

if (fs.existsSync('.env') && !force) {
  let current = fs.readFileSync('.env', 'utf8');
  const known = new Set(current.split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=/)).filter(Boolean).map((m) => m[1]));
  const missing = fs.readFileSync('.env.example', 'utf8').split(/\r?\n/)
    .filter((l) => { const m = l.match(/^([A-Z0-9_]+)=/); return m && !known.has(m[1]); })
    .map(secret);
  if (missing.length === 0) {
    console.log('[setup] .env existe déjà et est complet : rien à faire (utiliser --force pour le régénérer).');
    process.exit(0);
  }
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  if (!current.endsWith('\n')) current += eol;
  current += `${eol}# Ajouté par scripts/setup (nouveaux services)${eol}` + missing.join(eol) + eol;
  fs.writeFileSync('.env', current);
  console.log(`[setup] .env complété (valeurs existantes inchangées) : ${missing.map((l) => l.split('=')[0]).join(', ')}`);
  process.exit(0);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
});
const publicB64 = publicKey.toString('base64');
const privateB64 = privateKey.toString('base64');

let env = fs.readFileSync('.env.example', 'utf8');
env = env.replace(/^KC_REALM_PRIVATE_KEY=.*$/m, `KC_REALM_PRIVATE_KEY=${privateB64}`);
env = env.replace(/^KEYCLOAK_REALM_PUBLIC_KEY=.*$/m, `KEYCLOAK_REALM_PUBLIC_KEY=${publicB64}`);
env = secret(env);
fs.writeFileSync('.env', env);

const pem = `-----BEGIN PUBLIC KEY-----\n${publicB64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
fs.mkdirSync('keys', { recursive: true });
fs.writeFileSync('keys/realm-public.pem', pem);

console.log('[setup] .env créé (clés RSA du realm et secrets générés).');
console.log('[setup] keys/realm-public.pem créé.');
console.log('[setup] Lancer ensuite : docker compose up -d --build');
