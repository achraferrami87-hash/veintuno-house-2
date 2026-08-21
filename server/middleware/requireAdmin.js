function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminUserId) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }
  next();
}

module.exports = requireAdmin;
