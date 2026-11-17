const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs-extra');

const config = require('./config');
const adminAuth = require('./adminAuth');
const backupScheduler = require('./backupScheduler');
const guestRouter = require('./routes/guest');
const adminRouter = require('./routes/admin');

const app = express();

if (config.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    name: 'eventsnap.sid',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 14, // 14 Tage
    },
  })
);

app.use((req, res, next) => {
  res.locals.BASE_URL = config.BASE_URL;
  next();
});

app.get('/', (req, res) => res.redirect('/admin'));

app.use('/admin', adminRouter);
app.use('/e/:eventId', guestRouter);

app.use((req, res) => {
  res.status(404).render('error', { title: 'Seite nicht gefunden', message: 'Diese Seite existiert nicht.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Fehler', message: 'Es ist ein unerwarteter Fehler aufgetreten.' });
});

async function start() {
  await fs.ensureDir(config.EVENTS_DIR);
  await fs.ensureDir(config.BACKUPS_DIR);
  await adminAuth.ensureMigrated();
  await backupScheduler.initSchedules();

  app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`EventSnap laeuft auf http://0.0.0.0:${config.PORT}`);
  });
}

start().catch((err) => {
  console.error('Start fehlgeschlagen:', err);
  process.exit(1);
});
