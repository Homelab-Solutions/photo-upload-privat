function isWithinWindow(window, now = new Date()) {
  if (!window) return true;
  const { start, end } = window;
  if (start && now < new Date(start)) return false;
  if (end && now > new Date(end)) return false;
  return true;
}

function uploadWindowOpen(event) {
  return isWithinWindow(event.uploadWindow);
}

function galleryVisible(event) {
  return isWithinWindow(event.visibilityWindow);
}

module.exports = { isWithinWindow, uploadWindowOpen, galleryVisible };
