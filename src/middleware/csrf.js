const crypto = require('crypto');

// Schlankes, session-basiertes CSRF-Token-Handling (ohne die veraltete
// "csurf"-Abhaengigkeit). Token wird pro Session einmal erzeugt und muss bei
// jedem zustandsaendernden Request (POST/PUT/DELETE) mitgeschickt werden.

function ensureToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyToken(req, res, next) {
  const sent = req.body._csrf || req.headers['x-csrf-token'];
  if (!sent || sent !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: 'Ungueltige Anfrage',
      message: 'Sicherheitstoken ungueltig oder abgelaufen. Bitte Seite neu laden und erneut versuchen.',
    });
  }
  next();
}

module.exports = { ensureToken, verifyToken };
