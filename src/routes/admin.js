const express = require('express');
const path = require('path');
const crypto = require('crypto');

const dataStore = require('../dataStore');
const adminAuth = require('../adminAuth');
const csrf = require('../middleware/csrf');
const { requireAdmin } = require('../middleware/auth');
const { loginLimiter, settingsLimiter } = require('../middleware/rateLimit');
const { streamZip } = require('../utils/zip');
const { eventQrDataUrl, eventUrl } = require('../utils/qr');
const backupScheduler = require('../backupScheduler');
const config = require('../config');
const { TEMPLATES } = config;

const router = express.Router();

router.use(csrf.ensureToken);

router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', loginLimiter, csrf.verifyToken, async (req, res) => {
  const valid = await adminAuth.verifyPassword(req.body.password);
  if (valid) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Falsches Passwort.' });
});

router.post('/logout', requireAdmin, csrf.verifyToken, (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
});

router.use(requireAdmin);

router.get('/', async (req, res) => {
  const events = await dataStore.listEvents();
  const withStats = await Promise.all(
    events.map(async (e) => ({ event: e, stats: await dataStore.getEventStats(e.id) }))
  );
  res.render('admin/dashboard', { events: withStats });
});

// ---------- Globale Einstellungen ----------

function renderSettings(res, overrides = {}) {
  res.render('admin/settings', {
    baseUrl: config.BASE_URL,
    domainError: null,
    domainSaved: false,
    passwordError: null,
    passwordSuccess: false,
    ...overrides,
  });
}

router.get('/einstellungen', (req, res) => {
  renderSettings(res);
});

router.post('/einstellungen/domain', settingsLimiter, csrf.verifyToken, async (req, res) => {
  const value = (req.body.baseUrl || '').trim();
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
  } catch (err) {
    return renderSettings(res, {
      baseUrl: value,
      domainError: 'Bitte eine gueltige URL eingeben, z.B. https://fotos.meine-domain.de',
    });
  }
  await dataStore.setEnvValue('BASE_URL', value);
  renderSettings(res, { baseUrl: value, domainSaved: true });
});

router.post('/einstellungen/passwort', settingsLimiter, csrf.verifyToken, async (req, res) => {
  const { currentPassword, newPassword, newPasswordRepeat } = req.body;

  if (!currentPassword || !newPassword || !newPasswordRepeat) {
    return renderSettings(res, { passwordError: 'Bitte alle Felder ausfuellen.' });
  }
  const valid = await adminAuth.verifyPassword(currentPassword);
  if (!valid) {
    return renderSettings(res, { passwordError: 'Aktuelles Passwort ist falsch.' });
  }
  if (newPassword !== newPasswordRepeat) {
    return renderSettings(res, { passwordError: 'Die neuen Passwoerter stimmen nicht ueberein.' });
  }
  if (newPassword.length < 8) {
    return renderSettings(res, { passwordError: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' });
  }

  await adminAuth.changePassword(newPassword);
  renderSettings(res, { passwordSuccess: true });
});

router.get('/events/new', (req, res) => {
  res.render('admin/event-form', {
    mode: 'create',
    event: {
      name: '',
      template: TEMPLATES[0].id,
      password: crypto.randomBytes(4).toString('hex'),
      uploadWindow: { start: '', end: '' },
      visibilityWindow: { start: '', end: '' },
      showUploaderNames: false,
      backup: { enabled: false, intervalHours: 24 },
    },
    templates: TEMPLATES,
  });
});

router.post('/events', csrf.verifyToken, async (req, res) => {
  const event = await dataStore.createEvent(parseEventForm(req.body));
  backupScheduler.scheduleEvent(event);
  res.redirect(`/admin/events/${event.id}`);
});

router.get('/events/:id', async (req, res) => {
  const event = await dataStore.getEvent(req.params.id);
  if (!event) return res.status(404).render('error', { title: 'Nicht gefunden', message: 'Event existiert nicht.' });
  const stats = await dataStore.getEventStats(event.id);
  const qr = await eventQrDataUrl(event.id, event.password);
  res.render('admin/event-form', {
    mode: 'edit',
    event,
    templates: TEMPLATES,
    stats,
    qr,
    guestUrl: eventUrl(event.id, event.password),
  });
});

router.post('/events/:id', csrf.verifyToken, async (req, res) => {
  const event = await dataStore.updateEvent(req.params.id, parseEventForm(req.body));
  backupScheduler.scheduleEvent(event);
  res.redirect(`/admin/events/${event.id}`);
});

router.post('/events/:id/delete', csrf.verifyToken, async (req, res) => {
  backupScheduler.clearSchedule(req.params.id);
  await dataStore.deleteEvent(req.params.id);
  res.redirect('/admin');
});

router.post('/events/:id/backup-now', csrf.verifyToken, async (req, res) => {
  await dataStore.backupEvent(req.params.id);
  res.redirect(`/admin/events/${req.params.id}`);
});

function parseEventForm(body) {
  const toIso = (v) => (v ? new Date(v).toISOString() : null);
  return {
    name: body.name,
    template: body.template,
    password: body.password,
    uploadWindow: { start: toIso(body.uploadStart), end: toIso(body.uploadEnd) },
    visibilityWindow: { start: toIso(body.visibilityStart), end: toIso(body.visibilityEnd) },
    showUploaderNames: body.showUploaderNames === 'on',
    archived: body.archived === 'on',
    backup: {
      enabled: body.backupEnabled === 'on',
      intervalHours: parseInt(body.backupIntervalHours, 10) || 24,
    },
  };
}

// ---------- Foto-Moderation ----------

router.get('/events/:id/moderate', async (req, res) => {
  const event = await dataStore.getEvent(req.params.id);
  if (!event) return res.status(404).render('error', { title: 'Nicht gefunden', message: 'Event existiert nicht.' });
  const photos = await dataStore.getMetadata(event.id);

  const groups = new Map();
  for (const p of photos) {
    if (!groups.has(p.guestFolder)) groups.set(p.guestFolder, { guestName: p.guestName, guestFolder: p.guestFolder, photos: [] });
    groups.get(p.guestFolder).photos.push(p);
  }
  const guestGroups = Array.from(groups.values()).sort((a, b) => a.guestName.localeCompare(b.guestName));
  for (const g of guestGroups) {
    g.photos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  }

  res.render('admin/moderate', { event, guestGroups });
});

router.post('/events/:id/photos/:photoId/approve', csrf.verifyToken, async (req, res) => {
  await dataStore.updatePhotoStatus(req.params.id, req.params.photoId, 'approved');
  res.redirect(req.get('referer') || `/admin/events/${req.params.id}/moderate`);
});

router.post('/events/:id/photos/:photoId/reject', csrf.verifyToken, async (req, res) => {
  await dataStore.updatePhotoStatus(req.params.id, req.params.photoId, 'rejected');
  res.redirect(req.get('referer') || `/admin/events/${req.params.id}/moderate`);
});

router.post('/events/:id/photos/:photoId/delete', csrf.verifyToken, async (req, res) => {
  await dataStore.deletePhoto(req.params.id, req.params.photoId);
  res.redirect(req.get('referer') || `/admin/events/${req.params.id}/moderate`);
});

router.post('/events/:id/bulk', csrf.verifyToken, async (req, res) => {
  const ids = Array.isArray(req.body.photoIds) ? req.body.photoIds : [req.body.photoIds].filter(Boolean);
  const { action } = req.body;
  if (action === 'approve') await dataStore.updatePhotosStatusBulk(req.params.id, ids, 'approved');
  else if (action === 'reject') await dataStore.updatePhotosStatusBulk(req.params.id, ids, 'rejected');
  else if (action === 'delete') await dataStore.deletePhotosBulk(req.params.id, ids);
  res.redirect(req.get('referer') || `/admin/events/${req.params.id}/moderate`);
});

// ---------- Medien & Downloads ----------

router.get('/events/:id/media/:photoId/:variant(thumb|original)', async (req, res) => {
  const photo = await dataStore.getPhoto(req.params.id, req.params.photoId);
  if (!photo) return res.status(404).end();
  const paths = dataStore.paths(req.params.id);
  if (req.params.variant === 'thumb' && photo.thumbFilename) {
    return res.sendFile(path.join(paths.thumbsDir(photo.guestFolder), photo.thumbFilename));
  }
  return res.sendFile(path.join(paths.originalDir(photo.guestFolder), photo.storedFilename));
});

function uniqueArcNames(photos) {
  const seen = new Map();
  return photos.map((p) => {
    let name = p.originalFilename;
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    if (count > 0) {
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      name = `${base}_${count}${ext}`;
    }
    return { photo: p, arcName: name };
  });
}

router.get('/events/:id/download-all', async (req, res) => {
  const event = await dataStore.getEvent(req.params.id);
  const photos = await dataStore.getMetadata(req.params.id);
  const paths = dataStore.paths(req.params.id);
  const files = uniqueArcNames(photos).map(({ photo, arcName }) => ({
    filePath: path.join(paths.originalDir(photo.guestFolder), photo.storedFilename),
    arcName: `${photo.guestName}/${arcName}`,
  }));
  await streamZip(res, `${event.name.replace(/[^a-z0-9]+/gi, '_')}_alle.zip`, files);
});

router.get('/events/:id/download-guest/:guestFolder', async (req, res) => {
  const photos = await dataStore.getPhotosByEvent(req.params.id, { guestFolder: req.params.guestFolder });
  if (!photos.length) return res.status(404).send('Keine Fotos gefunden.');
  const paths = dataStore.paths(req.params.id);
  const files = uniqueArcNames(photos).map(({ photo, arcName }) => ({
    filePath: path.join(paths.originalDir(photo.guestFolder), photo.storedFilename),
    arcName,
  }));
  await streamZip(res, `${photos[0].guestName.replace(/[^a-z0-9]+/gi, '_')}.zip`, files);
});

module.exports = router;
