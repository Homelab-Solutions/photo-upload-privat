// Saeubert Nutzereingaben, die als Anzeigename oder als Ordnername
// (Dateisystem) verwendet werden.

function sanitizeDisplayName(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 80);
}

function slugify(raw) {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'gast';
}

function shortId(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length);
}

// Erzeugt aus einem Anzeigenamen einen eindeutigen, dateisystemsicheren
// Ordnernamen (Kollisionen bei Namensgleichheit werden durch ein Suffix vermieden).
function makeGuestFolderName(displayName) {
  return `${slugify(displayName)}-${shortId()}`;
}

module.exports = { sanitizeDisplayName, slugify, makeGuestFolderName };
