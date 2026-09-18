// Wczytuje .env.deploy (KEY=VALUE, ignorowany przez git) do process.env.
// Używane przez doraźne skrypty deploy*.js / check_vps.js w katalogu głównym repo,
// żeby dane logowania do VPS nie siedziały na sztywno w kodzie.
const fs = require('fs');
const path = require('path');

function loadDeployEnv() {
  const envPath = path.join(__dirname, '..', '.env.deploy');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDeployEnv();

function assertPresent(vars, names) {
  const missing = names.filter((n) => !vars[n]);
  if (missing.length) {
    throw new Error(
      `Brak wymaganych zmiennych w .env.deploy (lub środowisku): ${missing.join(', ')}. ` +
        'Skopiuj .env.deploy.example do .env.deploy i uzupełnij dane.'
    );
  }
}

module.exports = {
  VPS_HOST: process.env.VPS_HOST,
  VPS_PORT: process.env.VPS_PORT ? Number(process.env.VPS_PORT) : 22,
  VPS_USERNAME: process.env.VPS_USERNAME || 'root',
  VPS_PASSWORD: process.env.VPS_PASSWORD,
  SKILL_RUNNER_TOKEN: process.env.SKILL_RUNNER_TOKEN,
  assertPresent,
};
