const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');

const THUMB_WIDTH = 480;
const DISPLAY_MAX_DIMENSION = 2000;
const JPEG_QUALITY = 78;

/**
 * Komprimiert das Originalbild (verlustbehaftet, begrenzte maximale
 * Kantenlaenge) und erzeugt zusaetzlich ein kleines Thumbnail fuer die
 * Galerie-Kachelansicht. Ueberschreibt die Originaldatei am angegebenen Pfad.
 */
async function processImage(originalPath, thumbPath) {
  await fs.ensureDir(path.dirname(thumbPath));
  const buffer = await fs.readFile(originalPath);
  const image = sharp(buffer, { failOn: 'none' }).rotate();

  const compressed = await image
    .clone()
    .resize({
      width: DISPLAY_MAX_DIMENSION,
      height: DISPLAY_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  await fs.writeFile(originalPath, compressed);

  const thumb = await image
    .clone()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  await fs.writeFile(thumbPath, thumb);
}

module.exports = { processImage };
