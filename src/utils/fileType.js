const path = require('path');
const { ALLOWED_IMAGE_EXT, ALLOWED_VIDEO_EXT } = require('../config');

function classify(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ALLOWED_IMAGE_EXT.includes(ext)) return { type: 'image', ext };
  if (ALLOWED_VIDEO_EXT.includes(ext)) return { type: 'video', ext };
  return null;
}

module.exports = { classify };
