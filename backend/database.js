import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const getDatabasePath = () => resolve(process.cwd(), process.env.DB_PATH || './db/padel.sqlite');

export const openDatabase = () => {
  const dbPath = getDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(readFileSync(resolve(process.cwd(), 'db', 'schema.sql'), 'utf8'));

  return db;
};

