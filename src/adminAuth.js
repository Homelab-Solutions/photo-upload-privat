/**
 * Verwaltung des Admin-Passworts.
 *
 * Das Passwort lebt gehasht in data/admin-config.json (ueber dataStore.js).
 * ADMIN_PASSWORD aus der .env dient ausschliesslich der Erstmigration: Existiert
 * noch kein Hash, wird er einmalig aus dem env-Wert erzeugt. Danach wird die
 * env-Variable ignoriert, Aenderungen erfolgen nur noch ueber changePassword().
 */

const bcrypt = require('bcryptjs');
const dataStore = require('./dataStore');
const { ADMIN_PASSWORD } = require('./config');

const SALT_ROUNDS = 10;

async function ensureMigrated() {
  const existing = await dataStore.getAdminConfig();
  if (existing && existing.passwordHash) return;

  if (!ADMIN_PASSWORD) {
    throw new Error(
      'Kein Admin-Passwort vorhanden: Weder data/admin-config.json noch ADMIN_PASSWORD in .env gesetzt.'
    );
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  const now = new Date().toISOString();
  await dataStore.saveAdminConfig({
    ...(existing || {}),
    createdAt: (existing && existing.createdAt) || now,
    passwordHash,
    passwordUpdatedAt: now,
    migratedFromEnv: true,
  });
}

async function verifyPassword(plainPassword) {
  const cfg = await dataStore.getAdminConfig();
  if (!cfg || !cfg.passwordHash || !plainPassword) return false;
  return bcrypt.compare(plainPassword, cfg.passwordHash);
}

async function changePassword(newPassword) {
  const cfg = await dataStore.getAdminConfig();
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await dataStore.saveAdminConfig({
    ...(cfg || {}),
    passwordHash,
    passwordUpdatedAt: new Date().toISOString(),
    migratedFromEnv: false,
  });
}

module.exports = { ensureMigrated, verifyPassword, changePassword };
