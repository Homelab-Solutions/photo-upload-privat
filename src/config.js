const path = require('path');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');

module.exports = {
  DATA_DIR,
  EVENTS_DIR: path.join(DATA_DIR, 'events'),
  BACKUPS_DIR: path.join(DATA_DIR, 'backups'),
  ADMIN_CONFIG_PATH: path.join(DATA_DIR, 'admin-config.json'),
  ENV_PATH: path.join(__dirname, '..', '.env'),

  PORT: parseInt(process.env.PORT, 10) || 3005,
  // Nur fuer die Erstmigration relevant, siehe adminAuth.js: Danach lebt das
  // gehashte Passwort in data/admin-config.json und dieser Wert wird ignoriert.
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || null,
  SESSION_SECRET: process.env.SESSION_SECRET || 'insecure-dev-secret-change-me',
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3005}`,
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',

  MAX_UPLOAD_SIZE_IMAGE_MB: parseInt(process.env.MAX_UPLOAD_SIZE_IMAGE, 10) || 20,
  MAX_UPLOAD_SIZE_VIDEO_MB: parseInt(process.env.MAX_UPLOAD_SIZE_VIDEO, 10) || 100,

  TEMPLATES: [
    { id: 'elegant-wedding', label: 'Elegante Hochzeit' },
    { id: 'vibrant-birthday', label: 'Fröhliche Geburtstagsparty' },
    { id: 'corporate-event', label: 'Firmenevent' },
    { id: 'modern-minimal', label: 'Modern & Minimalistisch' },
    { id: 'rustikales-fest', label: 'Rustikales Fest' },
    { id: 'bunte-party', label: 'Bunte Party' },
    { id: 'bordeaux-gold', label: 'Bordeaux & Gold' },
    { id: 'petrol-koralle', label: 'Petrol & Koralle' },
  ],

  ALLOWED_IMAGE_EXT: ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp'],
  ALLOWED_VIDEO_EXT: ['.mp4', '.mov'],
};
