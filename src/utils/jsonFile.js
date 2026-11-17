const fs = require('fs-extra');
const path = require('path');

// Sehr einfache Pro-Datei-Warteschlange, damit parallele Schreibzugriffe
// (z.B. mehrere Uploads gleichzeitig) sich nicht gegenseitig ueberschreiben.
const queues = new Map();

function enqueue(filePath, task) {
  const previous = queues.get(filePath) || Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    filePath,
    next.finally(() => {
      if (queues.get(filePath) === next) queues.delete(filePath);
    })
  );
  return next;
}

async function readJson(filePath, defaultValue) {
  try {
    return await fs.readJson(filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return defaultValue;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeJson(tmpPath, data, { spaces: 2 });
  await fs.move(tmpPath, filePath, { overwrite: true });
}

// Fuehrt lesen+modifizieren+schreiben serialisiert pro Datei aus.
function updateJson(filePath, defaultValue, mutator) {
  return enqueue(filePath, async () => {
    const current = await readJson(filePath, defaultValue);
    const result = await mutator(current);
    const toWrite = result === undefined ? current : result;
    await writeJsonAtomic(filePath, toWrite);
    return toWrite;
  });
}

module.exports = { readJson, writeJsonAtomic, updateJson };
