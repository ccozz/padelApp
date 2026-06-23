import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const getDatabasePath = () => resolve(process.cwd(), process.env.DB_PATH || './db/padel.sqlite');

export const openDatabase = () => {
  const dbPath = getDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(readFileSync(resolve(process.cwd(), 'db', 'schema.sql'), 'utf8'));

  return db;
};

