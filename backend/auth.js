import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'padelApp_session';
export const PLAYER_COOKIE_NAME = 'padelApp_player_session';

export const getSessionSecret = () => {
  const sessionSecret = String(process.env.SESSION_SECRET ?? '').trim();

  if (!sessionSecret) {
    throw new Error('SESSION_SECRET no está configurada');
  }

  return sessionSecret;
};

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const verifyPassword = (password, passwordHash) => bcrypt.compare(password, passwordHash);

export const signSessionToken = (account, role = 'admin') =>
  jwt.sign(
    {
      sub: account.id,
      username: account.username,
      role,
    },
    getSessionSecret(),
    { expiresIn: '7d' },
  );

export const signPlayerSessionToken = (player) => signSessionToken(player, 'player');

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

export const requirePlayerAuth = (db) => (req, res, next) => {
  const token = req.cookies?.[PLAYER_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ error: 'Player authentication required' });
    return;
  }

  try {
    const session = verifySessionToken(token);

    if (session.role !== 'player') {
      res.status(401).json({ error: 'Invalid or expired player session' });
      return;
    }

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(session.sub);
    if (!player || player.account_status !== 'activo') {
      res.status(401).json({ error: 'Player account is not active' });
      return;
    }

    req.player = {
      ...session,
      player,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired player session' });
  }
};