import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './backend/database.js';
import { hashPassword } from './backend/auth.js';

dotenv.config();

const username = String(process.env.ADMIN_USERNAME || '').trim();
const passwordPlain = String(process.env.ADMIN_PASSWORD_PLAIN || '').trim();

if (!username || !passwordPlain) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD_PLAIN are required to seed the admin user.');
  process.exit(1);
}

const db = openDatabase();
const passwordHash = await hashPassword(passwordPlain);

db.prepare(
  `
    INSERT INTO admins (id, username, password_hash)
    VALUES (@id, @username, @passwordHash)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash
  `,
).run({
  id: randomUUID(),
  username,
  passwordHash,
});

console.log(`Admin seeded for ${username}`);

