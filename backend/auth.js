import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'padelApp_session';

export const getSessionSecret = () => {
  const sessionSecret = String(process.env.SESSION_SECRET ?? '').trim();

  if (!sessionSecret) {
    throw new Error('SESSION_SECRET no está configurada');
  }

  return sessionSecret;
};

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const verifyPassword = (password, passwordHash) => bcrypt.compare(password, passwordHash);

export const signSessionToken = (admin) =>
  jwt.sign(
    {
      sub: admin.id,
      username: admin.username,
      role: 'admin',
    },
    getSessionSecret(),
    { expiresIn: '7d' },
  );

export const verifySessionToken = (token) => jwt.verify(token, getSessionSecret());

export const requireAdmin = (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }

  try {
    req.admin = verifySessionToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin session' });
  }
};