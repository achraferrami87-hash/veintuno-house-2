const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
  const attemptBuf = Buffer.from(attempt, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (attemptBuf.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(attemptBuf, hashBuf);
}

module.exports = { hashPassword, verifyPassword };
