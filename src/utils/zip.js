const archiver = require('archiver');

// Streamt ein ZIP mit den angegebenen Dateien direkt in die HTTP-Response.
// files: [{ filePath, arcName }]
function streamZip(res, zipFilename, files) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500);
    res.end(`Fehler beim Erstellen des ZIP-Archivs: ${err.message}`);
  });
  archive.pipe(res);

  for (const f of files) {
    archive.file(f.filePath, { name: f.arcName });
  }

  return archive.finalize();
}

module.exports = { streamZip };
