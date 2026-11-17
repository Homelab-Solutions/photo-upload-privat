const QRCode = require('qrcode');
const { BASE_URL } = require('../config');

function eventUrl(eventId, password) {
  const url = new URL(`/e/${eventId}`, BASE_URL);
  url.searchParams.set('pwd', password);
  return url.toString();
}

async function eventQrDataUrl(eventId, password) {
  return QRCode.toDataURL(eventUrl(eventId, password), { margin: 1, width: 320 });
}

module.exports = { eventUrl, eventQrDataUrl };
