const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Zu viele Login-Versuche. Bitte spaeter erneut versuchen.',
});

const settingsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Zu viele Versuche. Bitte spaeter erneut versuchen.',
});

module.exports = { loginLimiter, settingsLimiter };
