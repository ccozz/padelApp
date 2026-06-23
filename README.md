# padelApp

Webapp mobile-first para gestión de torneos de padel.

## Objetivo
- Carga de parejas
- Generación automática de grupos y cuadro
- Tabla general normalizada
- Desempates
- Vista pública del torneo
- Panel de administración
- Historial de torneos con filtros por fecha y jugadores

## Backend

### Variables de entorno
- `PORT`
- `DB_PATH`
- `SESSION_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_PLAIN`

### Arranque desde cero
1. Copiar `.env.example` a `.env` y completar valores.
2. Instalar dependencias con `npm install`.
3. Crear o actualizar el admin inicial con `npm run db:seed`.
4. Levantar el servidor con `npm run dev`.
5. Abrir `http://localhost:3000`.

### Endpoints
- `GET /api/tournaments/current`
- `POST /api/tournaments`
- `PUT /api/tournaments/:id`
- `DELETE /api/tournaments/:id`
- `POST /api/tournaments/:id/plan`
- `POST /api/tournaments/:id/archive`
- `GET /api/players`
- `POST /api/players`
- `PUT /api/players/:id`
- `DELETE /api/players/:id`
- `GET /api/pairs`
- `POST /api/pairs`
- `PUT /api/pairs/:id`
- `DELETE /api/pairs/:id`
- `PUT /api/matches/:id`
- `GET /api/history`
- `POST /api/auth/login`
- `POST /api/auth/logout`

## Estado
Proyecto inicial.

## Desarrollo
- `npm run dev`
- Abrir `http://localhost:3000`
