import { randomUUID } from 'node:crypto';
import express from 'express';
import {
  buildBalancedGroups,
  buildKnockoutBracket,
  buildStandings,
  resolveBracketWinner,
  buildGroupFixtures,
} from '../lib/tournament.js';
import { COOKIE_NAME, PLAYER_COOKIE_NAME, requireAdmin, requirePlayerAuth, signPlayerSessionToken, signSessionToken, verifyPassword, hashPassword } from './auth.js';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.js';

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

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

const getFrontendUrl = () => {
  const frontendUrl = String(process.env.FRONTEND_URL ?? 'http://localhost:3000').trim().replace(/\/+$/, '');
  return frontendUrl || 'http://localhost:3000';
};

const getPlayerByEmail = (db, email) => db.prepare('SELECT * FROM players WHERE email = ?').get(email);

const getPlayerVerificationTokenByValue = (db, token) =>
  db.prepare('SELECT * FROM player_verification_tokens WHERE token = ?').get(token);

const getPlayerSessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const buildPlayerPublicRecord = (player) => ({
  id: player.id,
  first_name: player.first_name,
  firstName: player.first_name,
  last_name: player.last_name,
  lastName: player.last_name,
  nickname: player.nickname || '',
  full_name: player.full_name,
  fullName: player.full_name,
  email: player.email || null,
  emailVerified: Boolean(player.email_verified),
  accountStatus: player.account_status,
  account_status: player.account_status,
});

const getPlayerDisplayName = (player) =>
  normalizeText(player?.nickname) ||
  normalizeText(player?.full_name) ||
  normalizeText([player?.first_name, player?.last_name].filter(Boolean).join(' ')) ||
  'Jugador';

const toIsoNow = () => new Date().toISOString();

const getEventById = (db, eventId) => db.prepare('SELECT * FROM tournaments WHERE id = ?').get(eventId);
const getCategoryById = (db, categoryId) => db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
const getPlayerById = (db, playerId) => db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
const getPlayerByName = (db, firstName, lastName, excludedPlayerId = null) => {
  const query = excludedPlayerId
    ? `
        SELECT *
        FROM players
        WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
          AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
          AND id != ?
        LIMIT 1
      `
    : `
        SELECT *
        FROM players
        WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
          AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
        LIMIT 1
      `;

  return excludedPlayerId
    ? db.prepare(query).get(firstName, lastName, excludedPlayerId)
    : db.prepare(query).get(firstName, lastName);
};
const getPairById = (db, pairId) => db.prepare('SELECT * FROM pairs WHERE id = ?').get(pairId);

const buildDecoratedPairFromRow = (db, pairRow) => {
  if (!pairRow) {
    return null;
  }

  const players = getPlayers(db).map(decoratePlayer);
  const playerMap = new Map(players.map((player) => [player.id, player]));
  return decoratePair(pairRow, playerMap);
};

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

const getWaitlistByCategory = (db, categoryId) =>
  db
    .prepare(
      `
        SELECT *
        FROM waitlist
        WHERE category_id = ?
        ORDER BY datetime(requested_at) ASC, id ASC
      `,
    )
    .all(categoryId);

const getCategoryPairCount = (db, categoryId) =>
  db.prepare('SELECT COUNT(*) AS count FROM pairs WHERE category_id = ?').get(categoryId)?.count || 0;

const getCategoryInscriptions = (db, categoryId) => {
  const players = getPlayers(db).map(decoratePlayer);
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const pairRows = getPairsByCategory(db, categoryId);
  const waitlistRows = getWaitlistByCategory(db, categoryId);

  return {
    pairs: pairRows.map((pair) => decoratePair(pair, playerMap)),
    waitlist: waitlistRows.map((row) => ({
      ...row,
      categoryId: row.category_id,
      playerId: row.player_id,
      partnerId: row.partner_id,
      requestedAt: row.requested_at,
      player: playerMap.get(row.player_id) || null,
      partner: playerMap.get(row.partner_id) || null,
    })),
  };
};

const getPairByPlayerInCategory = (db, categoryId, playerId) =>
  db
    .prepare(
      `
        SELECT *
        FROM pairs
        WHERE category_id = ? AND (player_one_id = ? OR player_two_id = ?)
        LIMIT 1
      `,
    )
    .get(categoryId, playerId, playerId);

const getOtherPairByPlayerInCategory = (db, categoryId, playerId, excludedPairId = null) => {
  const query = excludedPairId
    ? `
        SELECT *
        FROM pairs
        WHERE category_id = ? AND id != ? AND (player_one_id = ? OR player_two_id = ?)
        LIMIT 1
      `
    : `
        SELECT *
        FROM pairs
        WHERE category_id = ? AND (player_one_id = ? OR player_two_id = ?)
        LIMIT 1
      `;

  return excludedPairId
    ? db.prepare(query).get(categoryId, excludedPairId, playerId, playerId)
    : db.prepare(query).get(categoryId, playerId, playerId);
};

const getPendingWaitlistEntry = (db, categoryId) =>
  db
    .prepare(
      `
        SELECT *
        FROM waitlist
        WHERE category_id = ? AND status = 'pendiente'
        ORDER BY datetime(requested_at) ASC, id ASC
        LIMIT 1
      `,
    )
    .get(categoryId);

const hasPendingWaitlistEntryForPlayer = (db, categoryId, playerId) =>
  Boolean(
    db
      .prepare(
        `
          SELECT 1
          FROM waitlist
          WHERE category_id = ? AND status = 'pendiente' AND (player_id = ? OR partner_id = ?)
          LIMIT 1
        `,
      )
      .get(categoryId, playerId, playerId),
  );

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

const decoratePlayer = (player) => buildPlayerPublicRecord(player);

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

  // Límite estructural: cada grupo necesita al menos 2 parejas para poder jugar fixtures internos.
  // Si no alcanza el total, se reduce la cantidad de grupos hasta que todos cumplan ese mínimo.
  const maxGroupsWithTwoPairsMinimum = Math.floor(pairCount / 2);
  return Math.max(1, Math.min(maxGroupsWithTwoPairsMinimum, Math.max(2, Math.ceil(pairCount / 4))));
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
      waitlist: [],
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
  const bracket = buildKnockoutBracket(standings, pairs, groups);
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
    waitlist: getWaitlistByCategory(db, categoryRow.id).map((row) => ({
      ...row,
      categoryId: row.category_id,
      playerId: row.player_id,
      partnerId: row.partner_id,
      requestedAt: row.requested_at,
      player: playerMap.get(row.player_id) || null,
      partner: playerMap.get(row.partner_id) || null,
    })),
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
      SET name = ?, status = ?, max_pairs = ?, winner_pair_id = ?, closed_at = ?, scoring_win = ?, scoring_loss = ?, scoring_no_show = ?, rules_version = ?
      WHERE id = ?
    `,
  ).run(
    normalizeText(body.name ?? current.name) || current.name,
    normalizeText(body.status ?? current.status) || current.status,
    parseOptionalNumber(body.maxPairs ?? body.max_pairs) ?? current.max_pairs ?? null,
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

const createPairRowForCategory = (db, categoryId, playerOneId, playerTwoId, name = '') => {
  const playerOne = getPlayerById(db, playerOneId);
  const playerTwo = getPlayerById(db, playerTwoId);
  if (!playerOne || !playerTwo) {
    return null;
  }

  const pairId = randomUUID();
  const pairName = normalizeText(name) || buildPairNameFromPlayers(playerOne, playerTwo);

  db.prepare(
    `
      INSERT INTO pairs (id, category_id, name, player_one_id, player_two_id)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(pairId, categoryId, pairName, playerOneId, playerTwoId);

  return getPairById(db, pairId);
};

const ensureCategoryCanReceiveInscriptions = (category) => category && category.status !== 'Torneo archivado';

const ensurePairDoesNotExistInCategory = (db, categoryId, playerId) => !getPairByPlayerInCategory(db, categoryId, playerId);

const addWaitlistEntry = (db, categoryId, playerId, partnerId, status = 'pendiente') => {
  const entryId = randomUUID();
  db.prepare(
    `
      INSERT INTO waitlist (id, category_id, player_id, partner_id, requested_at, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(entryId, categoryId, playerId, partnerId, toIsoNow(), status);

  return db.prepare('SELECT * FROM waitlist WHERE id = ?').get(entryId);
};

const promoteFirstWaitlistEntry = (db, categoryId) => {
  const pendingEntry = getPendingWaitlistEntry(db, categoryId);
  if (!pendingEntry) {
    return null;
  }

  const createdPair = createPairRowForCategory(db, categoryId, pendingEntry.player_id, pendingEntry.partner_id);
  if (!createdPair) {
    return null;
  }

  db.prepare("UPDATE waitlist SET status = 'promovido' WHERE id = ?").run(pendingEntry.id);
  return {
    waitlist: db.prepare('SELECT * FROM waitlist WHERE id = ?').get(pendingEntry.id),
    pair: createdPair,
  };
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
            max_pairs,
            winner_pair_id,
            closed_at,
            scoring_win,
            scoring_loss,
            scoring_no_show,
            rules_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(categoryId, eventId, categoryName, 'Torneo activo', parseOptionalNumber(req.body?.maxPairs ?? req.body?.max_pairs) ?? null, null, null, scoringWin, scoringLoss, scoringNoShow, rulesVersion);

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
            max_pairs,
            winner_pair_id,
            closed_at,
            scoring_win,
            scoring_loss,
            scoring_no_show,
            rules_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
    ).run(categoryId, event.id, categoryName, 'Torneo activo', parseOptionalNumber(req.body?.maxPairs ?? req.body?.max_pairs) ?? null, null, null, scoringWin, scoringLoss, scoringNoShow, rulesVersion);

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

    const duplicatePlayer = getPlayerByName(db, firstName, lastName);
    if (duplicatePlayer) {
      return jsonError(res, 400, `Ya existe un jugador registrado como ${firstName} ${lastName}`);
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

    const duplicatePlayer = getPlayerByName(db, firstName, lastName, req.params.id);
    if (duplicatePlayer) {
      return jsonError(res, 400, `Ya existe un jugador registrado como ${firstName} ${lastName}`);
    }

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

  router.post('/players/register', async (req, res) => {
    const firstName = normalizeText(req.body?.firstName ?? req.body?.first_name);
    const lastName = normalizeText(req.body?.lastName ?? req.body?.last_name);
    const nickname = normalizeText(req.body?.nickname);
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? '');

    if (!firstName || !lastName || !email || !password) {
      return jsonError(res, 400, 'firstName, lastName, email and password are required');
    }

    const existingPlayer = getPlayerByEmail(db, email);
    if (existingPlayer) {
      return jsonError(res, 409, 'El email ya está registrado');
    }

    const playerId = randomUUID();
    const passwordHash = await hashPassword(password);
    const verificationToken = randomUUID();

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(
        `
          INSERT INTO players (
            id,
            first_name,
            last_name,
            nickname,
            full_name,
            email,
            password_hash,
            email_verified,
            account_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(playerId, firstName, lastName, nickname, `${firstName} ${lastName}`.trim(), email, passwordHash, 0, 'pendiente_verificacion');

      const verificationToken = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `
          INSERT INTO player_verification_tokens (id, player_id, token, type, expires_at, created_at, used_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(randomUUID(), playerId, verificationToken, 'email_verification', expiresAt, toIsoNow(), null);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to register player');
    }

    try {
      await sendVerificationEmail(email, `${getFrontendUrl()}/verify-email?token=${encodeURIComponent(verificationToken)}`);
    } catch (error) {
      return jsonError(res, 502, error.message || 'Unable to send verification email');
    }

    return jsonOk(res, { ok: true, message: 'Registro creado. Revisá tu email para verificar la cuenta.' }, 201);
  });

  router.get('/players/verify-email', (req, res) => {
    const token = normalizeText(req.query?.token);
    if (!token) {
      return jsonError(res, 400, 'Verification token is required');
    }

    const tokenRow = getPlayerVerificationTokenByValue(db, token);
    if (!tokenRow || tokenRow.type !== 'email_verification') {
      return jsonError(res, 400, 'Invalid verification token');
    }

    if (tokenRow.used_at) {
      return jsonError(res, 410, 'Verification token already used');
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return jsonError(res, 410, 'Verification token expired');
    }

    const player = getPlayerById(db, tokenRow.player_id);
    if (!player) {
      return jsonError(res, 404, 'Player not found');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE players SET email_verified = 1, account_status = ? WHERE id = ?').run('activo', player.id);
      db.prepare('UPDATE player_verification_tokens SET used_at = ? WHERE id = ?').run(toIsoNow(), tokenRow.id);
      db.exec('COMMIT');
      return jsonOk(res, { ok: true, message: 'Email verificado correctamente' });
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to verify email');
    }
  });

  router.post('/players/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? '');

    if (!email || !password) {
      return jsonError(res, 400, 'email and password are required');
    }

    const player = getPlayerByEmail(db, email);
    if (!player || player.account_status === 'sin_cuenta') {
      return jsonError(res, 401, 'Credenciales inválidas');
    }

    if (player.account_status === 'pendiente_verificacion' || !player.email_verified) {
      return jsonError(res, 401, 'Debes verificar tu email antes de iniciar sesión');
    }

    if (player.account_status === 'bloqueado' || player.account_status === 'eliminado') {
      return jsonError(res, 401, 'Tu cuenta no puede iniciar sesión');
    }

    const passwordOk = await verifyPassword(password, player.password_hash || '');
    if (!passwordOk) {
      return jsonError(res, 401, 'Credenciales inválidas');
    }

    const token = signPlayerSessionToken({ id: player.id, username: player.email || player.full_name || player.id });
    res.cookie(PLAYER_COOKIE_NAME, token, getPlayerSessionCookieOptions());

    return jsonOk(res, { ok: true, player: decoratePlayer(player) });
  });

  router.post('/players/logout', (_req, res) => {
    res.clearCookie(PLAYER_COOKIE_NAME, getPlayerSessionCookieOptions());
    return jsonOk(res, { ok: true });
  });

  router.get('/players/me', requirePlayerAuth(db), (req, res) => {
    return jsonOk(res, { ok: true, player: decoratePlayer(req.player.player) });
  });

  router.post('/players/request-password-reset', async (req, res) => {
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return jsonOk(res, { ok: true, message: 'Si el email existe, vas a recibir un link.' });
    }

    const player = getPlayerByEmail(db, email);
    if (player && player.account_status === 'activo' && player.password_hash) {
      const resetToken = randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare(
          `
            INSERT INTO player_verification_tokens (id, player_id, token, type, expires_at, created_at, used_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(randomUUID(), player.id, resetToken, 'password_reset', expiresAt, toIsoNow(), null);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        return jsonError(res, 500, error.message || 'Unable to create password reset token');
      }

      try {
        await sendPasswordResetEmail(email, `${getFrontendUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`);
      } catch (error) {
        return jsonError(res, 502, error.message || 'Unable to send password reset email');
      }
    }

    return jsonOk(res, { ok: true, message: 'Si el email existe, vas a recibir un link.' });
  });

  router.post('/players/reset-password', async (req, res) => {
    const token = normalizeText(req.body?.token);
    const newPassword = String(req.body?.newPassword ?? '');

    if (!token || !newPassword) {
      return jsonError(res, 400, 'token and newPassword are required');
    }

    const tokenRow = getPlayerVerificationTokenByValue(db, token);
    if (!tokenRow || tokenRow.type !== 'password_reset') {
      return jsonError(res, 400, 'Invalid password reset token');
    }

    if (tokenRow.used_at) {
      return jsonError(res, 410, 'Password reset token already used');
    }

    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return jsonError(res, 410, 'Password reset token expired');
    }

    const player = getPlayerById(db, tokenRow.player_id);
    if (!player) {
      return jsonError(res, 404, 'Player not found');
    }

    const passwordHash = await hashPassword(newPassword);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE players SET password_hash = ? WHERE id = ?').run(passwordHash, player.id);
      db.prepare('UPDATE player_verification_tokens SET used_at = ? WHERE id = ?').run(toIsoNow(), tokenRow.id);
      db.exec('COMMIT');
      return jsonOk(res, { ok: true, message: 'La contraseña fue actualizada.' });
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to reset password');
    }
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

    const duplicatePlayerOnePair = getOtherPairByPlayerInCategory(db, categoryId, playerOneId);
    if (duplicatePlayerOnePair) {
      return jsonError(res, 400, `El jugador ${getPlayerDisplayName(playerOne)} ya tiene pareja en esta categoría`);
    }

    const duplicatePlayerTwoPair = getOtherPairByPlayerInCategory(db, categoryId, playerTwoId);
    if (duplicatePlayerTwoPair) {
      return jsonError(res, 400, `El jugador ${getPlayerDisplayName(playerTwo)} ya tiene pareja en esta categoría`);
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

    const duplicatePlayerOnePair = getOtherPairByPlayerInCategory(db, categoryId, playerOneId, req.params.id);
    if (duplicatePlayerOnePair) {
      return jsonError(res, 400, `El jugador ${getPlayerDisplayName(playerOne)} ya tiene pareja en esta categoría`);
    }

    const duplicatePlayerTwoPair = getOtherPairByPlayerInCategory(db, categoryId, playerTwoId, req.params.id);
    if (duplicatePlayerTwoPair) {
      return jsonError(res, 400, `El jugador ${getPlayerDisplayName(playerTwo)} ya tiene pareja en esta categoría`);
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

  router.get('/categories/:id/inscriptions', (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    return jsonOk(res, {
      category: serializeCategory(category),
      ...getCategoryInscriptions(db, category.id),
      maxPairs: category.max_pairs ?? null,
      pairCount: getCategoryPairCount(db, category.id),
    });
  });

  router.post('/categories/:id/inscriptions', requirePlayerAuth(db), (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    if (!ensureCategoryCanReceiveInscriptions(category)) {
      return jsonError(res, 409, 'Archived categories cannot receive inscriptions');
    }

    const partnerId = normalizeText(req.body?.partnerId ?? req.body?.partner_id);
    const playerId = req.player.player.id;
    if (!partnerId) {
      return jsonError(res, 400, 'partnerId is required');
    }

    if (partnerId === playerId) {
      return jsonError(res, 400, 'You cannot form a pair with yourself');
    }

    const partner = getPlayerById(db, partnerId);
    if (!partner) {
      return jsonError(res, 404, 'Partner not found');
    }

    if (
      !ensurePairDoesNotExistInCategory(db, category.id, playerId) ||
      !ensurePairDoesNotExistInCategory(db, category.id, partnerId) ||
      hasPendingWaitlistEntryForPlayer(db, category.id, playerId) ||
      hasPendingWaitlistEntryForPlayer(db, category.id, partnerId)
    ) {
      return jsonError(res, 409, 'One of the players is already registered in this category');
    }

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    const pairCount = getCategoryPairCount(db, category.id);
    const hasCapacity = category.max_pairs == null || pairCount < category.max_pairs;

    db.exec('BEGIN IMMEDIATE');
    try {
      if (!hasCapacity) {
        const waitlistEntry = addWaitlistEntry(db, category.id, playerId, partnerId, 'pendiente');
        db.exec('COMMIT');
        return jsonOk(
          res,
          {
            ok: true,
            waitlisted: true,
            waitlist: {
              ...waitlistEntry,
              categoryId: waitlistEntry.category_id,
              playerId: waitlistEntry.player_id,
              partnerId: waitlistEntry.partner_id,
              requestedAt: waitlistEntry.requested_at,
              player: playerMap.get(waitlistEntry.player_id) || null,
              partner: playerMap.get(waitlistEntry.partner_id) || null,
            },
          },
          202,
        );
      }

      const pairRow = createPairRowForCategory(db, category.id, playerId, partnerId);
      if (!pairRow) {
        throw new Error('Unable to create pair');
      }

      db.exec('COMMIT');
      return jsonOk(res, { ok: true, waitlisted: false, pair: decoratePair(pairRow, playerMap) }, 201);
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to create inscription');
    }
  });

  router.post('/categories/:id/waitlist', requirePlayerAuth(db), (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    if (!ensureCategoryCanReceiveInscriptions(category)) {
      return jsonError(res, 409, 'Archived categories cannot receive waitlist entries');
    }

    if (category.max_pairs == null) {
      return jsonError(res, 409, 'This category does not define a capacity');
    }

    const partnerId = normalizeText(req.body?.partnerId ?? req.body?.partner_id);
    const playerId = req.player.player.id;
    if (!partnerId) {
      return jsonError(res, 400, 'partnerId is required');
    }

    if (partnerId === playerId) {
      return jsonError(res, 400, 'You cannot form a pair with yourself');
    }

    const partner = getPlayerById(db, partnerId);
    if (!partner) {
      return jsonError(res, 404, 'Partner not found');
    }

    if (getCategoryPairCount(db, category.id) < category.max_pairs) {
      return jsonError(res, 409, 'The category still has available spots');
    }

    if (
      !ensurePairDoesNotExistInCategory(db, category.id, playerId) ||
      !ensurePairDoesNotExistInCategory(db, category.id, partnerId) ||
      hasPendingWaitlistEntryForPlayer(db, category.id, playerId) ||
      hasPendingWaitlistEntryForPlayer(db, category.id, partnerId)
    ) {
      return jsonError(res, 409, 'One of the players is already registered in this category');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const waitlistEntry = addWaitlistEntry(db, category.id, playerId, partnerId, 'pendiente');
      db.exec('COMMIT');
      return jsonOk(res, { ok: true, waitlist: waitlistEntry }, 201);
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to add waitlist entry');
    }
  });

  router.delete('/categories/:id/inscriptions/:pairId', requireAdmin, (req, res) => {
    const category = getCategoryById(db, req.params.id);
    if (!category) {
      return jsonError(res, 404, 'Category not found');
    }

    const pair = getPairById(db, req.params.pairId);
    if (!pair || pair.category_id !== category.id) {
      return jsonError(res, 404, 'Pair not found');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM pairs WHERE id = ?').run(pair.id);
      const promoted = promoteFirstWaitlistEntry(db, category.id);
      db.exec('COMMIT');

      return jsonOk(res, {
        ok: true,
        promoted: promoted
          ? {
              pair: decoratePair(promoted.pair, new Map(getPlayers(db).map((player) => [player.id, decoratePlayer(player)]))),
              waitlist: promoted.waitlist,
            }
          : null,
      });
    } catch (error) {
      db.exec('ROLLBACK');
      return jsonError(res, 500, error.message || 'Unable to revoke inscription');
    }
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
    const fixtures = buildGroupFixtures(pairs, groups);
    const groupIdMap = new Map(groups.map((group) => [group.id, randomUUID()]));
    const matchIdMap = new Map(fixtures.map((match) => [match.id, randomUUID()]));

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
        const databaseGroupId = groupIdMap.get(group.id) || randomUUID();
        insertGroup.run(databaseGroupId, category.id, group.name);
        group.pairIds.forEach((pairId) => insertGroupPair.run(databaseGroupId, pairId));
      });

      fixtures.forEach((match) => {
        const databaseMatchId = matchIdMap.get(match.id) || randomUUID();
        insertMatch.run(
          databaseMatchId,
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







