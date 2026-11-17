function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

function requireGuestAuth(req, res, next) {
  const { eventId } = req.params;
  const guestSession = req.session.events && req.session.events[eventId];
  if (!guestSession || !guestSession.authenticated) {
    return res.redirect(`/e/${eventId}`);
  }
  next();
}

function requireGuestName(req, res, next) {
  const { eventId } = req.params;
  const guestSession = req.session.events && req.session.events[eventId];
  if (!guestSession || !guestSession.authenticated) {
    return res.redirect(`/e/${eventId}`);
  }
  if (!guestSession.guestName) {
    return res.redirect(`/e/${eventId}`);
  }
  next();
}

module.exports = { requireAdmin, requireGuestAuth, requireGuestName };
