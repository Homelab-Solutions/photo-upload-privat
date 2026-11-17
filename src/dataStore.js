/**
 * Zentrales Datenzugriffs-Modul.
 *
 * Der Rest der App (Routen, Views) darf NIE direkt auf das Dateisystem
 * zugreifen, sondern ausschliesslich ueber die hier exportierten Funktionen.
 * Aktuell liegt die Persistenz in JSON-Dateien pro Event; das Backend kann
 * spaeter (z.B. gegen SQL) ausgetauscht werden, ohne dass Aufrufer sich aendern.
 */

const path = require('path');
const fs = require('fs-extra');
const { v4: uuid } = require('uuid');
const { EVENTS_DIR, BACKUPS_DIR, ADMIN_CONFIG_PATH, ENV_PATH } = require('./config');
const { readJson, updateJson } = require('./utils/jsonFile');

function eventDir(eventId) {
  return path.join(EVENTS_DIR, eventId);
}
function configPath(eventId) {
  return path.join(eventDir(eventId), 'config.json');
}
function metadataPath(eventId) {
  return path.join(eventDir(eventId), 'metadata.json');
}
function uploadsDir(eventId) {
  return path.join(eventDir(eventId), 'uploads');
}
function guestDir(eventId, guestFolder) {
  return path.join(uploadsDir(eventId), guestFolder);
}

// ---------- Admin-Konfiguration ----------
// (globale Einstellungen: Admin-Passwort-Hash etc., siehe adminAuth.js)

async function getAdminConfig() {
  return readJson(ADMIN_CONFIG_PATH, null);
}

async function saveAdminConfig(data) {
  return updateJson(ADMIN_CONFIG_PATH, null, () => data);
}

// ---------- .env-Datei (nur fuer einzelne, gezielt gesetzte Werte wie BASE_URL) ----------

async function setEnvValue(key, value) {
  return enqueueEnvWrite(async () => {
    let content = '';
    try {
      content = await fs.readFile(ENV_PATH, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const lines = content.length ? content.split(/\r?\n/) : [];
    let found = false;
    const updated = lines.map((line) => {
      if (line.startsWith(`${key}=`)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });
    while (updated.length && updated[updated.length - 1] === '') updated.pop();
    if (!found) updated.push(`${key}=${value}`);
    await fs.writeFile(ENV_PATH, `${updated.join('\n')}\n`, 'utf8');
  });
}

let envWriteQueue = Promise.resolve();
function enqueueEnvWrite(task) {
  const next = envWriteQueue.then(task, task);
  envWriteQueue = next.catch(() => {});
  return next;
}

// ---------- Events ----------

async function listEvents() {
  await fs.ensureDir(EVENTS_DIR);
  const entries = await fs.readdir(EVENTS_DIR, { withFileTypes: true });
  const ids = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const events = await Promise.all(ids.map((id) => getEvent(id)));
  return events
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getEvent(eventId) {
  if (!eventId) return null;
  const data = await readJson(configPath(eventId), null);
  return data;
}

async function createEvent(data) {
  const id = data.id || uuid();
  const now = new Date().toISOString();
  const event = {
    id,
    name: data.name,
    template: data.template,
    password: data.password,
    uploadWindow: data.uploadWindow || { start: null, end: null },
    visibilityWindow: data.visibilityWindow || { start: null, end: null },
    showUploaderNames: !!data.showUploaderNames,
    backup: data.backup || { enabled: false, intervalHours: 24, lastBackupAt: null },
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await fs.ensureDir(uploadsDir(id));
  await updateJson(configPath(id), null, () => event);
  await updateJson(metadataPath(id), [], (m) => m);
  return event;
}

async function updateEvent(eventId, patch) {
  return updateJson(configPath(eventId), null, (current) => {
    if (!current) throw new Error('Event nicht gefunden');
    return {
      ...current,
      ...patch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
  });
}

async function deleteEvent(eventId) {
  await fs.remove(eventDir(eventId));
}

// ---------- Fotos / Metadaten ----------

async function getMetadata(eventId) {
  return readJson(metadataPath(eventId), []);
}

async function saveMetadata(eventId, list) {
  return updateJson(metadataPath(eventId), [], () => list);
}

async function addPhoto(eventId, photoData) {
  const photo = {
    id: uuid(),
    status: 'pending',
    likes: 0,
    uploadedAt: new Date().toISOString(),
    ...photoData,
  };
  await updateJson(metadataPath(eventId), [], (list) => {
    list.push(photo);
    return list;
  });
  return photo;
}

async function updatePhotoStatus(eventId, photoId, status) {
  return updateJson(metadataPath(eventId), [], (list) =>
    list.map((p) => (p.id === photoId ? { ...p, status } : p))
  );
}

async function updatePhotosStatusBulk(eventId, photoIds, status) {
  const idSet = new Set(photoIds);
  return updateJson(metadataPath(eventId), [], (list) =>
    list.map((p) => (idSet.has(p.id) ? { ...p, status } : p))
  );
}

async function likePhoto(eventId, photoId) {
  let updated = null;
  await updateJson(metadataPath(eventId), [], (list) =>
    list.map((p) => {
      if (p.id === photoId) {
        updated = { ...p, likes: (p.likes || 0) + 1 };
        return updated;
      }
      return p;
    })
  );
  return updated;
}

async function deletePhoto(eventId, photoId) {
  const list = await getMetadata(eventId);
  const photo = list.find((p) => p.id === photoId);
  if (photo) {
    await fs.remove(path.join(guestDir(eventId, photo.guestFolder), 'original', photo.storedFilename)).catch(() => {});
    if (photo.thumbFilename) {
      await fs.remove(path.join(guestDir(eventId, photo.guestFolder), 'thumbs', photo.thumbFilename)).catch(() => {});
    }
  }
  await updateJson(metadataPath(eventId), [], (current) => current.filter((p) => p.id !== photoId));
}

async function deletePhotosBulk(eventId, photoIds) {
  for (const id of photoIds) {
    // sequentiell, um Race Conditions beim Datei-Loeschen zu vermeiden
    await deletePhoto(eventId, id);
  }
}

async function getPhotosByEvent(eventId, filter = {}) {
  const list = await getMetadata(eventId);
  return list.filter((p) => {
    if (filter.status && p.status !== filter.status) return false;
    if (filter.guestFolder && p.guestFolder !== filter.guestFolder) return false;
    return true;
  });
}

async function getPhoto(eventId, photoId) {
  const list = await getMetadata(eventId);
  return list.find((p) => p.id === photoId) || null;
}

// ---------- Pfad-Helfer (fuer Datei-Streaming in den Routen) ----------

function paths(eventId) {
  return {
    eventDir: eventDir(eventId),
    uploadsDir: uploadsDir(eventId),
    guestDir: (guestFolder) => guestDir(eventId, guestFolder),
    originalDir: (guestFolder) => path.join(guestDir(eventId, guestFolder), 'original'),
    thumbsDir: (guestFolder) => path.join(guestDir(eventId, guestFolder), 'thumbs'),
  };
}

async function getEventStats(eventId) {
  const list = await getMetadata(eventId);
  const approved = list.filter((p) => p.status === 'approved').length;
  const pending = list.filter((p) => p.status === 'pending').length;
  let totalBytes = 0;
  for (const p of list) totalBytes += p.size || 0;
  const guestNames = new Set(list.map((p) => p.guestFolder));
  return {
    totalUploads: list.length,
    approved,
    pending,
    rejected: list.length - approved - pending,
    guestCount: guestNames.size,
    totalBytes,
  };
}

async function backupEvent(eventId) {
  await fs.ensureDir(BACKUPS_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUPS_DIR, `${eventId}_${stamp}`);
  await fs.copy(eventDir(eventId), dest);
  await updateEvent(eventId, {
    backup: { ...(await getEvent(eventId)).backup, lastBackupAt: new Date().toISOString() },
  });
  return dest;
}

module.exports = {
  getAdminConfig,
  saveAdminConfig,
  setEnvValue,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getMetadata,
  saveMetadata,
  addPhoto,
  updatePhotoStatus,
  updatePhotosStatusBulk,
  likePhoto,
  deletePhoto,
  deletePhotosBulk,
  getPhotosByEvent,
  getPhoto,
  paths,
  getEventStats,
  backupEvent,
};
