const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const { v4: uuid } = require('uuid');

const dataStore = require('../dataStore');
const csrf = require('../middleware/csrf');
const { requireGuestAuth, requireGuestName } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { sanitizeDisplayName, makeGuestFolderName } = require('../utils/sanitize');
const { classify } = require('../utils/fileType');
const { processImage } = require('../utils/imageProcessing');
const { uploadWindowOpen, galleryVisible } = require('../utils/eventWindows');
const { streamZip } = require('../utils/zip');
const { MAX_UPLOAD_SIZE_IMAGE_MB, MAX_UPLOAD_SIZE_VIDEO_MB } = require('../config');

const router = express.Router({ mergeParams: true });

router.use(csrf.ensureToken);

router.use(async (req, res, next) => {
  const event = await dataStore.getEvent(req.params.eventId);
  if (!event) {
    return res.status(404).render('error', {
      title: 'Event nicht gefunden',
      message: 'Dieser Link ist ungueltig oder das Event wurde entfernt.',
    });
  }
  req.event = event;
  res.locals.event = event;
  res.locals.template = event.template;
  next();
});

function guestSessionOf(req) {
  req.session.events = req.session.events || {};
  req.session.events[req.event.id] = req.session.events[req.event.id] || {};
  return req.session.events[req.event.id];
}

// ---------- Login / Namenseingabe ----------

router.get('/', async (req, res) => {
  const gs = guestSessionOf(req);
  const pwd = req.query.pwd;

  if (pwd && !gs.authenticated) {
    if (pwd === req.event.password) {
      gs.authenticated = true;
      return res.redirect(`/e/${req.event.id}`);
    }
    return res.render('guest/login', { error: 'Falsches Passwort.', prefillPwd: pwd });
  }

  if (!gs.authenticated) {
    return res.render('guest/login', { error: null, prefillPwd: '' });
  }
  if (!gs.guestName) {
    return res.render('guest/name', { error: null });
  }
  return res.render('guest/menu', { guestName: gs.guestName });
});

router.post('/login', loginLimiter, csrf.verifyToken, (req, res) => {
  const gs = guestSessionOf(req);
  const { password } = req.body;
  if (password && password === req.event.password) {
    gs.authenticated = true;
    return res.redirect(`/e/${req.event.id}`);
  }
  return res.render('guest/login', { error: 'Falsches Passwort.', prefillPwd: '' });
});

router.post('/name', requireGuestAuth, csrf.verifyToken, async (req, res) => {
  const gs = guestSessionOf(req);
  const first = sanitizeDisplayName(req.body.firstName);
  const last = sanitizeDisplayName(req.body.lastName);
  if (!first || !last) {
    return res.render('guest/name', { error: 'Bitte Vor- und Nachname angeben.' });
  }
  const displayName = `${first} ${last}`;
  const folderName = makeGuestFolderName(displayName);
  gs.guestName = displayName;
  gs.guestFolder = folderName;

  const paths = dataStore.paths(req.event.id);
  await fs.ensureDir(paths.originalDir(folderName));
  await fs.ensureDir(paths.thumbsDir(folderName));

  res.redirect(`/e/${req.event.id}`);
});

router.post('/logout-name', requireGuestAuth, csrf.verifyToken, (req, res) => {
  const gs = guestSessionOf(req);
  delete gs.guestName;
  delete gs.guestFolder;
  res.redirect(`/e/${req.event.id}`);
});

// ---------- Upload ----------

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const gs = guestSessionOf(req);
      const dir = dataStore.paths(req.event.id).originalDir(gs.guestFolder);
      await fs.ensureDir(dir);
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: Math.max(MAX_UPLOAD_SIZE_IMAGE_MB, MAX_UPLOAD_SIZE_VIDEO_MB) * 1024 * 1024,
    files: 30,
  },
  fileFilter: (req, file, cb) => {
    const info = classify(file.originalname);
    cb(null, !!info);
  },
});

router.get('/upload', requireGuestName, (req, res) => {
  const open = uploadWindowOpen(req.event);
  res.render('guest/upload', {
    open,
    maxImageMb: MAX_UPLOAD_SIZE_IMAGE_MB,
    maxVideoMb: MAX_UPLOAD_SIZE_VIDEO_MB,
  });
});

router.post(
  '/upload',
  requireGuestName,
  (req, res, next) => {
    upload.array('photos', 30)(req, res, (err) => {
      if (err) {
        return res.status(400).render('guest/upload', {
          open: uploadWindowOpen(req.event),
          maxImageMb: MAX_UPLOAD_SIZE_IMAGE_MB,
          maxVideoMb: MAX_UPLOAD_SIZE_VIDEO_MB,
          error: 'Fehler beim Hochladen: ' + err.message,
        });
      }
      next();
    });
  },
  csrf.verifyToken,
  async (req, res) => {
    if (!uploadWindowOpen(req.event)) {
      return res.status(403).render('error', {
        title: 'Upload nicht moeglich',
        message: 'Das Upload-Zeitfenster fuer dieses Event ist derzeit geschlossen.',
      });
    }

    const gs = guestSessionOf(req);
    const paths = dataStore.paths(req.event.id);
    const files = req.files || [];
    let success = 0;
    const errors = [];

    for (const file of files) {
      const info = classify(file.originalname);
      const maxBytes = (info.type === 'image' ? MAX_UPLOAD_SIZE_IMAGE_MB : MAX_UPLOAD_SIZE_VIDEO_MB) * 1024 * 1024;

      if (file.size > maxBytes) {
        await fs.remove(file.path).catch(() => {});
        errors.push(`${file.originalname}: zu gross (max. ${info.type === 'image' ? MAX_UPLOAD_SIZE_IMAGE_MB : MAX_UPLOAD_SIZE_VIDEO_MB} MB).`);
        continue;
      }

      let storedFilename = path.basename(file.path);
      let thumbFilename = null;

      if (info.type === 'image') {
        const jpgName = `${path.basename(file.path, path.extname(file.path))}.jpg`;
        const thumbName = `thumb_${jpgName}`;
        const finalPath = path.join(paths.originalDir(gs.guestFolder), jpgName);
        const thumbPath = path.join(paths.thumbsDir(gs.guestFolder), thumbName);
        try {
          await processImage(file.path, thumbPath);
          if (file.path !== finalPath) {
            await fs.move(file.path, finalPath, { overwrite: true });
          }
          storedFilename = jpgName;
          thumbFilename = thumbName;
        } catch (err) {
          console.error('Bildverarbeitung fehlgeschlagen, speichere Original unbearbeitet:', err.message);
          storedFilename = path.basename(file.path);
          thumbFilename = null;
        }
      }

      const finalSize = (await fs.stat(path.join(paths.originalDir(gs.guestFolder), storedFilename))).size;

      await dataStore.addPhoto(req.event.id, {
        guestName: gs.guestName,
        guestFolder: gs.guestFolder,
        originalFilename: file.originalname,
        storedFilename,
        thumbFilename,
        type: info.type,
        mimeType: file.mimetype,
        size: finalSize,
      });
      success += 1;
    }

    res.render('guest/upload-result', { success, errors, total: files.length });
  }
);

// ---------- Galerie ----------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

router.get('/gallery', requireGuestName, async (req, res) => {
  const now = new Date();
  const win = req.event.visibilityWindow || {};
  if (win.start && now < new Date(win.start)) {
    return res.render('guest/gallery-closed', {
      message: 'Die Galerie ist noch nicht freigeschaltet. Bitte spaeter erneut vorbeischauen.',
    });
  }
  if (win.end && now > new Date(win.end)) {
    return res.render('guest/gallery-closed', {
      message: 'Dieses Event ist beendet. Bitte wende dich an den Gastgeber, falls du Fragen hast.',
    });
  }

  let photos = await dataStore.getPhotosByEvent(req.event.id, { status: 'approved' });
  photos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  if (!req.event.showUploaderNames) {
    photos = shuffle(photos);
  }

  res.render('guest/gallery', {
    photos,
    showNames: req.event.showUploaderNames,
  });
});

router.post('/photos/:photoId/like', requireGuestName, csrf.verifyToken, async (req, res) => {
  const photo = await dataStore.getPhoto(req.event.id, req.params.photoId);
  if (!photo || photo.status !== 'approved') {
    return res.status(404).json({ error: 'Foto nicht gefunden.' });
  }
  const updated = await dataStore.likePhoto(req.event.id, req.params.photoId);
  res.json({ likes: updated.likes });
});

// ---------- Medien ausliefern ----------

router.get('/media/:photoId/:variant(thumb|original)', requireGuestName, async (req, res) => {
  const photo = await dataStore.getPhoto(req.event.id, req.params.photoId);
  if (!photo || photo.status !== 'approved') return res.status(404).end();

  const paths = dataStore.paths(req.event.id);
  if (req.params.variant === 'thumb' && photo.thumbFilename) {
    return res.sendFile(path.join(paths.thumbsDir(photo.guestFolder), photo.thumbFilename));
  }
  return res.sendFile(path.join(paths.originalDir(photo.guestFolder), photo.storedFilename));
});

router.get('/photos/:photoId/download', requireGuestName, async (req, res) => {
  const photo = await dataStore.getPhoto(req.event.id, req.params.photoId);
  if (!photo || photo.status !== 'approved') return res.status(404).end();
  const paths = dataStore.paths(req.event.id);
  const filePath = path.join(paths.originalDir(photo.guestFolder), photo.storedFilename);
  res.download(filePath, photo.originalFilename);
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

router.post('/download-zip', requireGuestName, csrf.verifyToken, async (req, res) => {
  const ids = Array.isArray(req.body.photoIds) ? req.body.photoIds : [];
  const approved = await dataStore.getPhotosByEvent(req.event.id, { status: 'approved' });
  const selected = approved.filter((p) => ids.includes(p.id));
  if (!selected.length) return res.status(400).send('Keine gueltigen Fotos ausgewaehlt.');

  const paths = dataStore.paths(req.event.id);
  const files = uniqueArcNames(selected).map(({ photo, arcName }) => ({
    filePath: path.join(paths.originalDir(photo.guestFolder), photo.storedFilename),
    arcName,
  }));
  await streamZip(res, `${req.event.name.replace(/[^a-z0-9]+/gi, '_')}_auswahl.zip`, files);
});

router.get('/download-all', requireGuestName, async (req, res) => {
  const approved = await dataStore.getPhotosByEvent(req.event.id, { status: 'approved' });
  if (!approved.length) return res.status(400).send('Es gibt noch keine freigegebenen Fotos.');

  const paths = dataStore.paths(req.event.id);
  const files = uniqueArcNames(approved).map(({ photo, arcName }) => ({
    filePath: path.join(paths.originalDir(photo.guestFolder), photo.storedFilename),
    arcName,
  }));
  await streamZip(res, `${req.event.name.replace(/[^a-z0-9]+/gi, '_')}_alle.zip`, files);
});

module.exports = router;
