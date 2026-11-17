const dataStore = require('./dataStore');

const timers = new Map();

function clearSchedule(eventId) {
  const t = timers.get(eventId);
  if (t) {
    clearInterval(t);
    timers.delete(eventId);
  }
}

function scheduleEvent(event) {
  clearSchedule(event.id);
  if (!event.backup || !event.backup.enabled) return;
  const hours = Math.max(1, parseInt(event.backup.intervalHours, 10) || 24);
  const ms = hours * 60 * 60 * 1000;
  const timer = setInterval(() => {
    dataStore.backupEvent(event.id).catch((err) => {
      console.error(`Backup fehlgeschlagen fuer Event ${event.id}:`, err.message);
    });
  }, ms);
  timer.unref();
  timers.set(event.id, timer);
}

async function initSchedules() {
  const events = await dataStore.listEvents();
  events.forEach(scheduleEvent);
}

module.exports = { initSchedules, scheduleEvent, clearSchedule };
