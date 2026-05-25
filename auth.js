const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = 60 * 60 * 24 * 7; // 7 days

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, familyId: user.family_id, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: '请先登录' });
  }

  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userId: payload.userId, familyId: payload.familyId, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: '登录已过期，请重新登录' });
  }
}

function requireParent(req, res, next) {
  if (req.user.role !== 'parent') {
    return res.status(403).json({ ok: false, error: '仅家长可执行此操作' });
  }
  next();
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  requireAuth,
  requireParent,
};
