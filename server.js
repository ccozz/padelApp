import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './backend/database.js';
import { createApiRouter } from './backend/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname);
const port = Number(process.env.PORT || 3000);
const db = openDatabase();

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-session-secret'));
app.use('/api', createApiRouter(db));
app.use(express.static(root, { extensions: ['html'] }));

app.use((req, res, next) => {
  if (req.path.startsWith('/api') || (req.method !== 'GET' && req.method !== 'HEAD')) {
    next();
    return;
  }

  res.sendFile(resolve(root, 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`padelApp running at http://localhost:${port}`);
});
