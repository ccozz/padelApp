import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  buildBalancedCrossGroupFixtures,
  buildBalancedGroups,
  buildKnockoutBracket,
  buildStandings,
  resolveBracketWinner,
} from '../lib/tournament.js';
import { COOKIE_NAME, requireAdmin, signSessionToken, verifyPassword } from './auth.js';

const jsonOk = (res, data, status = 200) => res.status(status).json(data);
const jsonError = (res, status, error) => res.status(status).json({ error });

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

const formatDateLabel = (dateValue) => {
  if (!dateValue) {
    return '';
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const buildEventName = (place, dateValue) => {
  const placeLabel = normalizeText(place) || 'Sede';
  const dateLabel = formatDateLabel(dateValue) || 'sin-fecha';
  return `TORNEO EN ${placeLabel.toUpperCase()} ${dateLabel}`;
};

const getWinnerFromScore = (pairAId, pairBId, setsA, setsB, gamesA, gamesB) => {
  if (setsA > setsB) return pairAId;
  if (setsB > setsA) return pairBId;
  if (gamesA > gamesB) return pairAId;
  if (gamesB > gamesA) return pairBId;
  return null;
};

const parseOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const parseOptionalBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }

  return null;
};

const toIsoNow = () => new Date().toISOString();

const getEventById = (db, eventId) => db.prepare('SELECT * FROM tournaments WHERE id = ?').get(eventId);
const getCategoryById = (db, categoryId) => db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
const getPlayerById = (db, playerId) => db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
const getPairById = (db, pairId) => db.prepare('SELECT * FROM pairs WHERE id = ?').get(pairId);

const getPlayers = (db) =>
  db.prepare('SELECT * FROM players ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, nickname COLLATE NOCASE').all();

const getEvents = (db) => db.prepare('SELECT * FROM tournaments ORDER BY datetime(created_at) DESC, id DESC').all();

const getCurrentEvent = (db) =>
  db
    .prepare(
      `
        SELECT *
        FROM tournaments
        WHERE status <> 'Evento archivado'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
      `,
    )
    .get();

const getCategoriesByEvent = (db, eventId) =>
  db.prepare('SELECT * FROM categories WHERE event_id = ? ORDER BY name COLLATE NOCASE, id ASC').all(eventId);

const getPairsByCategory = (db, categoryId) =>
  db.prepare('SELECT * FROM pairs WHERE category_id = ? ORDER BY name COLLATE NOCASE, id ASC').all(categoryId);

const getGroupsByCategory = (db, categoryId) =>
  db.prepare('SELECT * FROM groups WHERE category_id = ? ORDER BY name COLLATE NOCASE, id ASC').all(categoryId);

const getGroupPairs = (db, groupIds) => {
  if (!groupIds.length) {
    return [];
  }

  const placeholders = groupIds.map(() => '?').join(',');
  return db
    .prepare(`SELECT group_id, pair_id FROM group_pairs WHERE group_id IN (${placeholders}) ORDER BY group_id ASC, pair_id ASC`)
    .all(...groupIds);
};

const getMatchesByCategory = (db, categoryId) =>
  db
    .prepare(
      `
        SELECT *
        FROM matches
        WHERE category_id = ?
        ORDER BY COALESCE(date, '') ASC, COALESCE(time, '') ASC, stage ASC, id ASC
      `,
    )
    .all(categoryId);

const serializeEvent = (eventRow) =>
  eventRow
    ? {
        ...eventRow,
        createdAt: eventRow.created_at,
        winnerId: eventRow.winner_id,
        closedAt: eventRow.closed_at,
        scoringWin: eventRow.scoring_win,
        scoringLoss: eventRow.scoring_loss,
        scoringNoShow: eventRow.scoring_no_show,
        rulesVersion: eventRow.rules_version,
      }
    : null;

const serializeCategory = (categoryRow) =>
  categoryRow
    ? {
        ...categoryRow,
        eventId: categoryRow.event_id,
        winnerPairId: categoryRow.winner_pair_id,
        closedAt: categoryRow.closed_at,
        scoringWin: categoryRow.scoring_win,
        scoringLoss: categoryRow.scoring_loss,
        scoringNoShow: categoryRow.scoring_no_show,
        rulesVersion: categoryRow.rules_version,
      }
    : null;

const decoratePlayer = (player) => ({
  ...player,
  firstName: player.first_name,
  lastName: player.last_name,
  nickname: player.nickname || '',
  fullName: player.full_name,
});

const decoratePair = (pair, playerMap) => ({
  ...pair,
  categoryId: pair.category_id,
  playerOneId: pair.player_one_id,
  playerTwoId: pair.player_two_id,
  playerOne: playerMap.get(pair.player_one_id) || null,
  playerTwo: playerMap.get(pair.player_two_id) || null,
});

const decorateGroup = (group, groupPairs, pairMap) => {
  const pairIds = groupPairs.filter((row) => row.group_id === group.id).map((row) => row.pair_id);

  return {
    ...group,
    categoryId: group.category_id,
    pairIds,
    pairs: pairIds.map((pairId) => pairMap.get(pairId)).filter(Boolean),
  };
};

const decorateMatch = (match, pairMap) => ({
  ...match,
  categoryId: match.category_id,
  pairAId: match.pair_a_id,
  pairBId: match.pair_b_id,
  pairALabel: pairMap.get(match.pair_a_id)?.name || match.pair_a_id,
  pairBLabel: pairMap.get(match.pair_b_id)?.name || match.pair_b_id,
  scoreA: match.score_a,
  scoreB: match.score_b,
  setsA: match.sets_a,
  setsB: match.sets_b,
  gamesA: match.games_a,
  gamesB: match.games_b,
  winnerId: match.winner_id,
  played: Boolean(match.played),
});

const getGroupCount = (pairCount) => {
  if (pairCount <= 1) {
    return 1;
  }

  return Math.min(pairCount, Math.max(2, Math.ceil(pairCount / 4)));
};

const parseSnapshot = (snapshotJson) => {
  if (!snapshotJson) {
    return null;
  }

  try {
    return JSON.parse(snapshotJson);
  } catch {
    return { rawSnapshot: snapshotJson };
  }
};

const buildCategoryBundle = (db, categoryRow, players = null, includePlayers = true) => {
  if (!categoryRow) {
    return {
      event: null,
      category: null,
      players: includePlayers ? getPlayers(db).map(decoratePlayer) : [],
      pairs: [],
      groups: [],
      matches: [],
      standings: [],
      bracket: [],
      bracketResults: [],
      bracketChampion: null,
    };
  }

  const eventRow = getEventById(db, categoryRow.event_id);
  const playerList = players || getPlayers(db).map(decoratePlayer);
  const playerMap = new Map(playerList.map((player) => [player.id, player]));
  const pairRows = getPairsByCategory(db, categoryRow.id);
  const pairs = pairRows.map((pair) => decoratePair(pair, playerMap));
  const pairMap = new Map(pairs.map((pair) => [pair.id, pair]));
  const groupRows = getGroupsByCategory(db, categoryRow.id);
  const groupPairs = getGroupPairs(db, groupRows.map((group) => group.id));
  const matches = getMatchesByCategory(db, categoryRow.id).map((match) => decorateMatch(match, pairMap));
  const standings = buildStandings(pairs, matches);
  const bracket = buildKnockoutBracket(standings, pairs, 8);
  const bracketResults = matches
    .filter((match) => match.stage !== 'groups' && match.played)
    .map((match) => ({
      matchId: match.id,
      winnerId: match.winnerId,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      setsA: match.setsA,
      setsB: match.setsB,
      gamesA: match.gamesA,
      gamesB: match.gamesB,
    }));
  const bracketOutcome = resolveBracketWinner(bracket, bracketResults, pairs);

  return {
    event: serializeEvent(eventRow),
    category: serializeCategory(categoryRow),
    ...(includePlayers ? { players: playerList } : {}),
    pairs,
    groups: groupRows.map((group) => decorateGroup(group, groupPairs, pairMap)),
    matches,
    standings,
    bracket,
    bracketResults,
    bracketChampion: bracketOutcome.champion,
  };
};

const buildEventBundle = (db, eventRow) => {
  if (!eventRow) {
    return {
      event: null,
      players: getPlayers(db).map(decoratePlayer),
      categories: [],
    };
  }

  const players = getPlayers(db).map(decoratePlayer);
  const categories = getCategoriesByEvent(db, eventRow.id).map((categoryRow) =>
    buildCategoryBundle(db, categoryRow, players, false),
  );

  return {
    event: serializeEvent(eventRow),
    players,
    categories,
  };
};

const syncEventStatus = (db, eventId) => {
  const eventRow = getEventById(db, eventId);
  if (!eventRow) {
    return null;
  }

  const categories = getCategoriesByEvent(db, eventId);
  if (!categories.length) {
    return serializeEvent(eventRow);
  }

  const allArchived = categories.every((category) => category.status === 'Torneo archivado');
  const nextStatus = allArchived ? 'Evento archivado' : 'Evento activo';
  const nextClosedAt = allArchived ? eventRow.closed_at || toIsoNow() : eventRow.closed_at || null;

  db.prepare('UPDATE tournaments SET status = ?, closed_at = ? WHERE id = ?').run(nextStatus, nextClosedAt, eventId);
  return serializeEvent(getEventById(db, eventId));
};

const storeCategorySnapshot = (db, categoryRow, bundle) => {
  const snapshot = {
    event: bundle.event,
    category: bundle.category,
    players: bundle.players || [],
    pairs: bundle.pairs,
    groups: bundle.groups,
    matches: bundle.matches,
    standings: bundle.standings,
    bracket: bundle.bracket,
    bracketResults: bundle.bracketResults,
    bracketChampion: bundle.bracketChampion,
  };

  db.prepare(
    `
      INSERT INTO history (id, event_id, category_id, archived_at, snapshot_json)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), categoryRow.event_id, categoryRow.id, toIsoNow(), JSON.stringify(snapshot));
};

const ensureAuthUser = (req) => ({ id: req.admin.sub, username: req.admin.username });

const clearCategoryPlanning = (db, categoryId) => {
  db.prepare('DELETE FROM group_pairs WHERE group_id IN (SELECT id FROM groups WHERE category_id = ?)').run(categoryId);
  db.prepare('DELETE FROM matches WHERE category_id = ?').run(categoryId);
  db.prepare('DELETE FROM groups WHERE category_id = ?').run(categoryId);
};

const getEventCategoryCount = (db, eventId) =>
  db.prepare('SELECT COUNT(*) AS count FROM categories WHERE event_id = ?').get(eventId)?.count || 0;

const buildPairNameFromPlayers = (playerOne, playerTwo) => {
  const getLabel = (player) => normalizeText(player?.full_name) || normalizeText([player?.first_name, player?.last_name].filter(Boolean).join(' '));
  return `${getLabel(playerOne) || 'Jugador'} / ${getLabel(playerTwo) || 'Jugador'}`;
};

const getMatchContext = (db, matchId) => {
  const matchRow = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!matchRow) {
    return null;
  }

  const categoryRow = getCategoryById(db, matchRow.category_id);
  const eventRow = categoryRow ? getEventById(db, categoryRow.event_id) : null;
  return { matchRow, categoryRow, eventRow };
};

const buildMatchUpdate = (existing, body) => {
  const scoreA = body.score_a ?? body.scoreA ?? existing.score_a;
  const scoreB = body.score_b ?? body.scoreB ?? existing.score_b;
  const setsA = body.sets_a ?? body.setsA ?? existing.sets_a;
  const setsB = body.sets_b ?? body.setsB ?? existing.sets_b;
  const gamesA = body.games_a ?? body.gamesA ?? existing.games_a;
  const gamesB = body.games_b ?? body.gamesB ?? existing.games_b;
  const playedValue = body.played !== undefined ? parseOptionalBoolean(body.played) : null;
  const played = playedValue ?? [scoreA, scoreB, setsA, setsB, gamesA, gamesB].some((value) => value !== null && value !== undefined && value !== '');
  const winnerId = body.winner_id ?? body.winnerId ?? (played ? getWinnerFromScore(existing.pair_a_id, existing.pair_b_id, Number(setsA || 0), Number(setsB || 0), Number(gamesA || 0), Number(gamesB || 0)) : existing.winner_id);

  return {
    date: body.date ?? existing.date ?? '',
    time: body.time ?? existing.time ?? '',
    venue: body.venue ?? existing.venue ?? '',
    score_a: scoreA === '' ? null : scoreA,
    score_b: scoreB === '' ? null : scoreB,
    sets_a: setsA === '' ? null : setsA,
    sets_b: setsB === '' ? null : setsB,
    games_a: gamesA === '' ? null : gamesA,
    games_b: gamesB === '' ? null : gamesB,
    played,
    winner_id: winnerId || null,
  };
};

const updateEventFields = (db, eventId, body) => {
  const current = getEventById(db, eventId);
  if (!current) {
    return null;
  }

  const nextName = normalizeText(body.name ?? body.eventName ?? current.name) || current.name;
  const nextDate = normalizeText(body.date ?? current.date) || current.date;
  const nextMode = normalizeText(body.mode ?? current.mode) || current.mode;
  const nextPlace = normalizeText(body.place ?? current.place) || current.place;
  const nextStatus = normalizeText(body.status ?? current.status) || current.status;

  db.prepare(
    `
      UPDATE tournaments
      SET name = ?, date = ?, mode = ?, place = ?, status = ?, winner_id = ?, closed_at = ?, scoring_win = ?, scoring_loss = ?, scoring_no_show = ?, rules_version = ?
      WHERE id = ?
    `,
  ).run(
    nextName,
    nextDate,
    nextMode,
    nextPlace,
    nextStatus,
    body.winnerId ?? body.winner_id ?? current.winner_id ?? null,
    body.closedAt ?? body.closed_at ?? current.closed_at ?? null,
    parseOptionalNumber(body.scoringWin ?? body.scoring_win) ?? current.scoring_win,
    parseOptionalNumber(body.scoringLoss ?? body.scoring_loss) ?? current.scoring_loss,
    parseOptionalNumber(body.scoringNoShow ?? body.scoring_no_show) ?? current.scoring_no_show,
    parseOptionalNumber(body.rulesVersion ?? body.rules_version) ?? current.rules_version,
    eventId,
  );

  return getEventById(db, eventId);
};

const updateCategoryFields = (db, categoryId, body) => {
  const current = getCategoryById(db, categoryId);
  if (!current) {
    return null;
  }

  db.prepare(
    `
      UPDATE categories
      SET name = ?, status = ?, winner_pair_id = ?, closed_at = ?, scoring_win = ?, scoring_loss = ?, scoring_no_show = ?, rules_version = ?
      WHERE id = ?
    `,
  ).run(
    normalizeText(body.name ?? current.name) || current.name,
    normalizeText(body.status ?? current.status) || current.status,
    body.winnerPairId ?? body.winner_pair_id ?? current.winner_pair_id ?? null,
    body.closedAt ?? body.closed_at ?? current.closed_at ?? null,
    parseOptionalNumber(body.scoringWin ?? body.scoring_win) ?? current.scoring_win,
    parseOptionalNumber(body.scoringLoss ?? body.scoring_loss) ?? current.scoring_loss,
    parseOptionalNumber(body.scoringNoShow ?? body.scoring_no_show) ?? current.scoring_no_show,
    parseOptionalNumber(body.rulesVersion ?? body.rules_version) ?? current.rules_version,
    categoryId,
  );

  return getCategoryById(db, categoryId);
};

export const createApiRouter = (db) => {
  const router = express.Router();

  router.use(express.json());

  router.post('/auth/login', async (req, res) => {
    const username = normalizeText(req.body?.username);
    const password = String(req.body?.password ?? '');

    if (!username || !password) {
      return jsonError(res, 400, 'Username and password are required');
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) {
      return jsonError(res, 401, 'Invalid credentials');
    }

    const passwordOk = await verifyPassword(password, admin.password_hash);
    if (!passwordOk) {
      return jsonError(res, 401, 'Invalid credentials');
    }

    const token = signSessionToken({ id: admin.id, username: admin.username });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return jsonOk(res, { ok: true, admin: { id: admin.id, username: admin.username } });
  });

  router.get('/auth/me', requireAdmin, (req, res) => jsonOk(res, { ok: true, admin: ensureAuthUser(req) }));

  router.post('/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return jsonOk(res, { ok: true });
  });

  router.get('/events/current', (_req, res) => {
    const event = getCurrentEvent(db);
    return jsonOk(res, buildEventBundle(db, event));
  });

  router.get('/events', (_req, res) => {
    const events = getEvents(db).map((eventRow) => ({
      event: serializeEvent(eventRow),
      categories: getCategoriesByEvent(db, eventRow.id).map((categoryRow) => serializeCategory(categoryRow)),
    }));

    return jsonOk(res, events);
  });

  router.get('/events/:id', (req, res) => {
    const event = getEventById(db, req.params.id);
    if (!event) {
      return jsonError(res, 404, 'Event not found');
    }

    return jsonOk(res, buildEventBundle(db, event));
  });

  router.post('/events', requireAdmin, (req, res) => {
    const now = toIsoNow();
    const eventId = randomUUID();
    const name = normalizeText(req.body?.name ?? req.body?.eventName) || buildEventName(req.body?.place, req.body?.date);
    const date = normalizeText(req.body?.date);
    const mode = normalizeText(req.body?.mode) || 'clásico';
    const place = normalizeText(req.body?.place);
    const categoryName = normalizeText(req.body?.categoryName ?? req.body?.category_name) || name;
    const scoringWin = parseOptionalNumber(req.body?.scoringWin ?? req.body?.scoring_win) ?? 1;
    const scoringLoss = parseOptionalNumber(req.body?.scoringLoss ?? req.body?.scoring_loss) ?? 0;
    const scoringNoShow = parseOptionalNumber(req.body?.scoringNoShow ?? req.body?.scoring_no_show) ?? 0;
    const rulesVersion = parseOptionalNumber(req.body?.rulesVersion ?? req.body?.rules_version) ?? 1;

    if (!date) {
      return jsonError(res, 400, 'Event date is required');
    }

    db.exec('BEGIN IMMEDIATE');

    try {
      db.prepare(
        `
          INSERT INTO tournaments (
            id,
            name,
            date,
            mode,
            place,
            status,
            created_at,
            winner_id,
            closed_at,
            scoring_win,
            scoring_loss,
            scoring_no_show,
            rules_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(eventId, name, date, mode, place, 'Evento activo', now, null, null, scoringWin, scoringLoss, scoringNoShow, rulesVersion);

      const categoryId = randomUUID();
      db.prepare(
        `
          INSERT INTO categories (
            id,
            event_id,
            name,
            status,
            winner_pair_id,
            closed_at,
            scoring_win,
            scoring_loss,
            scoring_no_show,
            rules_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(categoryId, eventId, categoryName, 'Torneo activo', null, null, scoringWin, scoringLoss, scoringNoShow, rulesVersion);

      db.exec('COMMIT');
      return jsonOk(res, buildEventBundle(db, getEventById(db, eventId)), 201);
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to create event');
    }
  });

  router.put('/events/:id', requireAdmin, (req, res) => {
    const updatedEvent = updateEventFields(db, req.params.id, req.body || {});
    if (!updatedEvent) {
      return jsonError(res, 404, 'Event not found');
    }

    return jsonOk(res, buildEventBundle(db, updatedEvent));
  });

  router.delete('/events/:id', requireAdmin, (req, res) => {
    const event = getEventById(db, req.params.id);
    if (!event) {
      return jsonError(res, 404, 'Event not found');
    }

    db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
    return jsonOk(res, { ok: true });
  });

  router.get('/events/:id/categories', (req, res) => {
    const event = getEventById(db, req.params.id);
    if (!event) {
      return jsonError(res, 404, 'Event not found');
    }

    return jsonOk(res, getCategoriesByEvent(db, event.id).map((categoryRow) => serializeCategory(categoryRow)));
  });

  router.post('/events/:id/categories', requireAdmin, (req, res) => {
    const event = getEventById(db, req.params.id);
    if (!event) {
      return jsonError(res, 404, 'Event not found');
    }

    if (event.status === 'Evento archivado') {
      return jsonError(res, 409, 'Archived events cannot receive new categories');
    }

    const categoryId = randomUUID();
    const categoryName = normalizeText(req.body?.name ?? req.body?.categoryName) || `Categoría ${getEventCategoryCount(db, event.id) + 1}`;
    const scoringWin = parseOptionalNumber(req.body?.scoringWin ?? req.body?.scoring_win) ?? 1;
    const scoringLoss = parseOptionalNumber(req.body?.scoringLoss ?? req.body?.scoring_loss) ?? 0;
    const scoringNoShow = parseOptionalNumber(req.body?.scoringNoShow ?? req.body?.scoring_no_show) ?? 0;
    const rulesVersion = parseOptionalNumber(req.body?.rulesVersion ?? req.body?.rules_version) ?? 1;

    db.prepare(
      `
        INSERT INTO categories (
          id,
          event_id,
          name,
          status,
          winner_pair_id,
          closed_at,
          scoring_win,
          scoring_loss,
          scoring_no_show,
          rules_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(categoryId, event.id, categoryName, 'Torneo activo', null, null, scoringWin, scoringLoss, scoringNoShow, rulesVersion);

    syncEventStatus(db, event.id);
    return jsonOk(res, buildEventBundle(db, getEventById(db, event.id)), 201);
  });

  router.get('/categories/:id', (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    return jsonOk(res, buildCategoryBundle(db, category));
  });

  router.put('/categories/:id', requireAdmin, (req, res) => {
    const category = updateCategoryFields(db, req.params.id, req.body || {});
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    syncEventStatus(db, category.event_id);
    return jsonOk(res, buildCategoryBundle(db, category));
  });

  router.delete('/categories/:id', requireAdmin, (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    if (getEventCategoryCount(db, category.event_id) <= 1) {
      return jsonError(res, 409, 'An event must keep at least one category');
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    syncEventStatus(db, category.event_id);
    return jsonOk(res, { ok: true });
  });

  router.get('/players', (_req, res) => jsonOk(res, getPlayers(db).map(decoratePlayer)));

  router.post('/players', requireAdmin, (req, res) => {
    const firstName = normalizeText(req.body?.firstName ?? req.body?.first_name);
    const lastName = normalizeText(req.body?.lastName ?? req.body?.last_name);
    const nickname = normalizeText(req.body?.nickname);
    const fullName = normalizeText(req.body?.fullName ?? req.body?.full_name) || [firstName, lastName].filter(Boolean).join(' ');

    if (!firstName || !lastName) {
      return jsonError(res, 400, 'First name and last name are required');
    }

    const id = randomUUID();
    db.prepare(
      `
        INSERT INTO players (id, first_name, last_name, nickname, full_name)
        VALUES (?, ?, ?, ?, ?)
      `,
    ).run(id, firstName, lastName, nickname, fullName || `${firstName} ${lastName}`);

    return jsonOk(res, decoratePlayer(getPlayerById(db, id)), 201);
  });

  router.put('/players/:id', requireAdmin, (req, res) => {
    const current = getPlayerById(db, req.params.id);
    if (!current) {
      return jsonError(res, 404, 'Player not found');
    }

    const firstName = normalizeText(req.body?.firstName ?? req.body?.first_name ?? current.first_name);
    const lastName = normalizeText(req.body?.lastName ?? req.body?.last_name ?? current.last_name);
    const nickname = normalizeText(req.body?.nickname ?? current.nickname);
    const fullName = normalizeText(req.body?.fullName ?? req.body?.full_name) || [firstName, lastName].filter(Boolean).join(' ');

    db.prepare(
      `
        UPDATE players
        SET first_name = ?, last_name = ?, nickname = ?, full_name = ?
        WHERE id = ?
      `,
    ).run(firstName, lastName, nickname || null, fullName || `${firstName} ${lastName}`, req.params.id);

    return jsonOk(res, decoratePlayer(getPlayerById(db, req.params.id)));
  });

  router.delete('/players/:id', requireAdmin, (req, res) => {
    const current = getPlayerById(db, req.params.id);
    if (!current) {
      return jsonError(res, 404, 'Player not found');
    }

    db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
    return jsonOk(res, { ok: true });
  });

  router.get('/pairs', (req, res) => {
    const categoryId = normalizeText(req.query.category_id ?? req.query.categoryId);
    const pairRows = categoryId ? getPairsByCategory(db, categoryId) : db.prepare('SELECT * FROM pairs ORDER BY name COLLATE NOCASE, id ASC').all();
    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    return jsonOk(res, pairRows.map((pair) => decoratePair(pair, playerMap)));
  });

  router.get('/pairs/:id', (req, res) => {
    const pair = getPairById(db, req.params.id);
    if (!pair) {
      return jsonError(res, 404, 'Pair not found');
    }

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    return jsonOk(res, decoratePair(pair, playerMap));
  });

  router.post('/pairs', requireAdmin, (req, res) => {
    const categoryId = normalizeText(req.body?.category_id ?? req.body?.categoryId);
    const category = getCategoryById(db, categoryId);

    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    const playerOneId = normalizeText(req.body?.player_one_id ?? req.body?.playerOneId);
    const playerTwoId = normalizeText(req.body?.player_two_id ?? req.body?.playerTwoId);
    const name = normalizeText(req.body?.name ?? '');

    if (!playerOneId || !playerTwoId || playerOneId === playerTwoId) {
      return jsonError(res, 400, 'Two distinct players are required');
    }

    const playerOne = getPlayerById(db, playerOneId);
    const playerTwo = getPlayerById(db, playerTwoId);
    if (!playerOne || !playerTwo) {
      return jsonError(res, 400, 'Both players must exist');
    }

    const pairId = randomUUID();
    const pairName = name || buildPairNameFromPlayers(playerOne, playerTwo);

    db.prepare(
      `
        INSERT INTO pairs (id, category_id, name, player_one_id, player_two_id)
        VALUES (?, ?, ?, ?, ?)
      `,
    ).run(pairId, categoryId, pairName, playerOneId, playerTwoId);

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    return jsonOk(res, decoratePair(getPairById(db, pairId), playerMap), 201);
  });

  router.put('/pairs/:id', requireAdmin, (req, res) => {
    const existing = getPairById(db, req.params.id);
    if (!existing) {
      return jsonError(res, 404, 'Pair not found');
    }

    const categoryId = normalizeText(req.body?.category_id ?? req.body?.categoryId ?? existing.category_id);
    const category = getCategoryById(db, categoryId);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    const playerOneId = normalizeText(req.body?.player_one_id ?? req.body?.playerOneId ?? existing.player_one_id);
    const playerTwoId = normalizeText(req.body?.player_two_id ?? req.body?.playerTwoId ?? existing.player_two_id);
    const name = normalizeText(req.body?.name ?? existing.name);

    if (!playerOneId || !playerTwoId || playerOneId === playerTwoId) {
      return jsonError(res, 400, 'Two distinct players are required');
    }

    const playerOne = getPlayerById(db, playerOneId);
    const playerTwo = getPlayerById(db, playerTwoId);
    if (!playerOne || !playerTwo) {
      return jsonError(res, 400, 'Both players must exist');
    }

    db.prepare(
      `
        UPDATE pairs
        SET category_id = ?, name = ?, player_one_id = ?, player_two_id = ?
        WHERE id = ?
      `,
    ).run(categoryId, name || buildPairNameFromPlayers(playerOne, playerTwo), playerOneId, playerTwoId, req.params.id);

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    return jsonOk(res, decoratePair(getPairById(db, req.params.id), playerMap));
  });

  router.delete('/pairs/:id', requireAdmin, (req, res) => {
    const existing = getPairById(db, req.params.id);
    if (!existing) {
      return jsonError(res, 404, 'Pair not found');
    }

    db.prepare('DELETE FROM pairs WHERE id = ?').run(req.params.id);
    return jsonOk(res, { ok: true });
  });

  router.post('/categories/:id/plan', requireAdmin, (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    if (category.status === 'Torneo archivado') {
      return jsonError(res, 409, 'Archived categories cannot be planned again');
    }

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    const pairs = getPairsByCategory(db, category.id).map((pair) => decoratePair(pair, playerMap));

    if (pairs.length < 2) {
      return jsonError(res, 400, 'At least two pairs are required');
    }

    const groupCount = getGroupCount(pairs.length);
    const groups = buildBalancedGroups(pairs, groupCount);
    const fixtures = buildBalancedCrossGroupFixtures(pairs, groups);

    db.exec('BEGIN IMMEDIATE');

    try {
      clearCategoryPlanning(db, category.id);

      const insertGroup = db.prepare('INSERT INTO groups (id, category_id, name) VALUES (?, ?, ?)');
      const insertGroupPair = db.prepare('INSERT INTO group_pairs (group_id, pair_id) VALUES (?, ?)');
      const insertMatch = db.prepare(
        `
          INSERT INTO matches (
            id,
            category_id,
            stage,
            pair_a_id,
            pair_b_id,
            date,
            time,
            venue,
            score_a,
            score_b,
            sets_a,
            sets_b,
            games_a,
            games_b,
            played,
            winner_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );

      groups.forEach((group) => {
        insertGroup.run(group.id, category.id, group.name);
        group.pairIds.forEach((pairId) => insertGroupPair.run(group.id, pairId));
      });

      fixtures.forEach((match) => {
        insertMatch.run(
          match.id,
          category.id,
          match.stage,
          match.pairAId,
          match.pairBId,
          match.date || '',
          match.time || '',
          match.venue || '',
          match.scoreA ?? null,
          match.scoreB ?? null,
          match.setsA ?? null,
          match.setsB ?? null,
          match.gamesA ?? null,
          match.gamesB ?? null,
          Number(Boolean(match.played)),
          match.winnerId || null,
        );
      });

      db.prepare('UPDATE categories SET status = ? WHERE id = ?').run('Torneo planificado', category.id);
      syncEventStatus(db, category.event_id);
      db.exec('COMMIT');
      return jsonOk(res, buildCategoryBundle(db, getCategoryById(db, category.id), players));
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to plan category');
    }
  });

  router.post('/categories/:id/archive', requireAdmin, (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    const players = getPlayers(db).map(decoratePlayer);
    const bundleBeforeArchive = buildCategoryBundle(db, category, players);
    const winnerPairId = normalizeText(req.body?.winner_pair_id ?? req.body?.winnerPairId) || bundleBeforeArchive.bracketChampion?.winnerId || bundleBeforeArchive.standings[0]?.pairId || null;

    if (winnerPairId && !bundleBeforeArchive.pairs.some((pair) => pair.id === winnerPairId)) {
      return jsonError(res, 400, 'Winner pair does not belong to the category');
    }

    db.exec('BEGIN IMMEDIATE');

    try {
      db.prepare(
        `
          UPDATE categories
          SET status = ?, winner_pair_id = ?, closed_at = ?
          WHERE id = ?
        `,
      ).run('Torneo archivado', winnerPairId, toIsoNow(), category.id);

      const archivedCategory = getCategoryById(db, category.id);
      const archiveBundle = buildCategoryBundle(db, archivedCategory, players);
      storeCategorySnapshot(db, archivedCategory, archiveBundle);
      syncEventStatus(db, category.event_id);

      db.exec('COMMIT');
      return jsonOk(res, buildEventBundle(db, getEventById(db, category.event_id)));
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to archive category');
    }
  });

  router.put('/matches/:id', requireAdmin, (req, res) => {
    const context = getMatchContext(db, req.params.id);
    if (!context) {
      return jsonError(res, 404, 'Match not found');
    }

    if (context.categoryRow?.status === 'Torneo archivado') {
      return jsonError(res, 409, 'Archived categories cannot be edited');
    }

    const update = buildMatchUpdate(context.matchRow, req.body || {});
    db.prepare(
      `
        UPDATE matches
        SET date = ?, time = ?, venue = ?, score_a = ?, score_b = ?, sets_a = ?, sets_b = ?, games_a = ?, games_b = ?, played = ?, winner_id = ?
        WHERE id = ?
      `,
    ).run(
      update.date,
      update.time,
      update.venue,
      update.score_a,
      update.score_b,
      update.sets_a,
      update.sets_b,
      update.games_a,
      update.games_b,
      Number(Boolean(update.played)),
      update.winner_id,
      req.params.id,
    );

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    const pairRows = getPairsByCategory(db, context.categoryRow.id).map((pair) => decoratePair(pair, playerMap));
    const pairMap = new Map(pairRows.map((pair) => [pair.id, pair]));
    return jsonOk(res, decorateMatch(db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id), pairMap));
  });

  router.get('/matches/:id', (req, res) => {
    const context = getMatchContext(db, req.params.id);
    if (!context) {
      return jsonError(res, 404, 'Match not found');
    }

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    const pairRows = getPairsByCategory(db, context.categoryRow.id).map((pair) => decoratePair(pair, playerMap));
    const pairMap = new Map(pairRows.map((pair) => [pair.id, pair]));
    return jsonOk(res, decorateMatch(context.matchRow, pairMap));
  });

  router.get('/history', (_req, res) => {
    const historyRows = db
      .prepare(
        `
          SELECT
            h.*,
            e.name AS event_name,
            e.date AS event_date,
            e.mode AS event_mode,
            e.place AS event_place,
            e.status AS event_status,
            e.created_at AS event_created_at,
            c.name AS category_name,
            c.status AS category_status,
            c.closed_at AS category_closed_at,
            c.winner_pair_id AS category_winner_pair_id
          FROM history h
          JOIN tournaments e ON e.id = h.event_id
          JOIN categories c ON c.id = h.category_id
          ORDER BY datetime(h.archived_at) DESC, h.id DESC
        `,
      )
      .all();

    const grouped = new Map();

    historyRows.forEach((row) => {
      if (!grouped.has(row.event_id)) {
        grouped.set(row.event_id, {
          event: serializeEvent({
            id: row.event_id,
            name: row.event_name,
            date: row.event_date,
            mode: row.event_mode,
            place: row.event_place,
            status: row.event_status,
            created_at: row.event_created_at,
            winner_id: null,
            closed_at: null,
            scoring_win: 1,
            scoring_loss: 0,
            scoring_no_show: 0,
            rules_version: 1,
          }),
          categories: [],
        });
      }

      grouped.get(row.event_id).categories.push({
        category: serializeCategory({
          id: row.category_id,
          event_id: row.event_id,
          name: row.category_name,
          status: row.category_status,
          winner_pair_id: row.category_winner_pair_id,
          closed_at: row.category_closed_at,
          scoring_win: 1,
          scoring_loss: 0,
          scoring_no_show: 0,
          rules_version: 1,
        }),
        archivedAt: row.archived_at,
        snapshot: parseSnapshot(row.snapshot_json),
      });
    });

    return jsonOk(res, [...grouped.values()]);
  });

  router.get('/categories/:id/pairs', (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    return jsonOk(res, getPairsByCategory(db, category.id).map((pair) => decoratePair(pair, playerMap)));
  });

  router.get('/categories/:id/matches', (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    const pairRows = getPairsByCategory(db, category.id).map((pair) => decoratePair(pair, playerMap));
    const pairMap = new Map(pairRows.map((pair) => [pair.id, pair]));

    return jsonOk(res, getMatchesByCategory(db, category.id).map((match) => decorateMatch(match, pairMap)));
  });

  return router;
};
