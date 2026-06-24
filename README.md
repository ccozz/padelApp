# padelApp

Webapp mobile-first para gestión de torneos de padel.

## Modelo de datos
- `tournaments` se conserva como nombre histórico de la tabla, pero representa el `EVENT`.
- Cada `EVENT` tiene una o más `CATEGORIES`.
- `players` sigue siendo global.
- `pairs`, `groups` y `matches` pertenecen a una `category`.
- `history` archiva por `category` y la API lo agrupa por `event`.

## Backend
- Requiere Node 24+.
- Usa `node:sqlite` incorporado, sin dependencias nativas externas.
- `seed.js` no cambió: solo crea el admin inicial.

### Variables de entorno
- `PORT`
- `DB_PATH`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_PLAIN`
- `SESSION_SECRET` es obligatoria; si falta, el servidor no arranca.

### Arranque desde cero
1. Copiar `.env.example` a `.env` y completar valores.
2. Instalar dependencias con `npm install`.
3. Crear o actualizar el admin inicial con `npm run db:seed`.
4. Levantar el servidor con `npm run dev`.
5. Abrir `http://localhost:3000`.

### Endpoints
#### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

#### Events
- `GET /api/events`
- `GET /api/events/current`
- `GET /api/events/:id`
- `POST /api/events`
- `PUT /api/events/:id`
- `DELETE /api/events/:id`
- `GET /api/events/:id/categories`
- `POST /api/events/:id/categories`

#### Categories
- `GET /api/categories/:id`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `GET /api/categories/:id/pairs`
- `GET /api/categories/:id/matches`
- `POST /api/categories/:id/plan`
- `POST /api/categories/:id/archive`

#### Players
- `GET /api/players`
- `POST /api/players`
- `PUT /api/players/:id`
- `DELETE /api/players/:id`

#### Pairs
- `GET /api/pairs`
- `GET /api/pairs/:id`
- `POST /api/pairs`
- `PUT /api/pairs/:id`
- `DELETE /api/pairs/:id`

#### Matches
- `GET /api/matches/:id`
- `PUT /api/matches/:id`

#### History
- `GET /api/history`

## Decisiones de diseño
- El archivado real ocurre a nivel `category`.
- Un `EVENT` pasa a archivado solo cuando todas sus categorías están archivadas.
- El historial devuelve eventos agrupados con sus categorías archivadas anidadas.
- Mantener `tournaments` como tabla de eventos evita una migración destructiva sobre la base ya existente.