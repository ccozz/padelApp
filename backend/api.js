import { randomUUID } from 'node:crypto';
import express from 'express';
import { buildBalancedCrossGroupFixtures, buildBalancedGroups, buildKnockoutBracket, buildStandings, resolveBracketWinner } from '../lib/tournament.js';
import { COOKIE_NAME, requireAdmin, signSessionToken, verifyPassword } from './auth.js';

const jsonOk = (res, data, status = 200) => res.status(status).json(data);

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

const buildTournamentName = (place, dateValue) => {
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

const buildMatchUpdate = (existing, body) => {
  const scoreA = body.score_a ?? body.scoreA ?? existing.score_a;
  const scoreB = body.score_b ?? body.scoreB ?? existing.score_b;
  const setsA = body.sets_a ?? body.setsA ?? existing.sets_a;
  const setsB = body.sets_b ?? body.setsB ?? existing.sets_b;
  const gamesA = body.games_a ?? body.gamesA ?? existing.games_a;
  const gamesB = body.games_b ?? body.gamesB ?? existing.games_b;
  const played =
    body.played !== undefined
      ? Boolean(body.played)
      : [scoreA, scoreB, setsA, setsB, gamesA, gamesB].some((value) => value !== null && value !== undefined && value !== '');
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

const getCurrentActiveTournament = (db) =>
  db.prepare(
    `
      SELECT *
      FROM tournaments
      WHERE status <> 'Torneo archivado'
      ORDER BY datetime(created_at) DESC, rowid DESC
      LIMIT 1
    `,
  ).get();

const getTournamentById = (db, tournamentId) => db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId);

const getPlayers = (db) =>
  db.prepare('SELECT * FROM players ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, nickname COLLATE NOCASE').all();

const getPairsByTournament = (db, tournamentId) =>
  db.prepare('SELECT * FROM pairs WHERE tournament_id = ? ORDER BY name COLLATE NOCASE').all(tournamentId);

const getGroupsByTournament = (db, tournamentId) =>
  db.prepare('SELECT * FROM groups WHERE tournament_id = ? ORDER BY name COLLATE NOCASE').all(tournamentId);

const getGroupPairs = (db, groupIds) => {
  if (!groupIds.length) {
    return [];
  }

  const placeholders = groupIds.map(() => '?').join(',');
  return db
    .prepare(`SELECT group_id, pair_id FROM group_pairs WHERE group_id IN (${placeholders}) ORDER BY group_id, pair_id`)
    .all(...groupIds);
};

const getMatchesByTournament = (db, tournamentId) =>
  db.prepare('SELECT * FROM matches WHERE tournament_id = ? ORDER BY COALESCE(date, \'\') ASC, COALESCE(time, \'\') ASC, stage ASC, id ASC').all(tournamentId);

const decoratePlayer = (player) => ({
  ...player,
  firstName: player.first_name,
  lastName: player.last_name,
  nickname: player.nickname || '',
  fullName: player.full_name,
});

const decoratePair = (pair, playerMap) => ({
  ...pair,
  tournamentId: pair.tournament_id,
  playerOneId: pair.player_one_id,
  playerTwoId: pair.player_two_id,
  playerOne: playerMap.get(pair.player_one_id) || null,
  playerTwo: playerMap.get(pair.player_two_id) || null,
});

const decorateMatch = (match, pairMap) => ({
  ...match,
  tournamentId: match.tournament_id,
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

const loadTournamentBundle = (db, tournamentRow) => {
  if (!tournamentRow) {
    return {
      tournament: null,
      players: getPlayers(db).map(decoratePlayer),
      pairs: [],
      groups: [],
      matches: [],
      standings: [],
      bracket: [],
      bracketResults: [],
      bracketChampion: null,
    };
  }

  const players = getPlayers(db).map(decoratePlayer);
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const pairs = getPairsByTournament(db, tournamentRow.id).map((pair) => decoratePair(pair, playerMap));
  const pairMap = new Map(pairs.map((pair) => [pair.id, pair]));
  const groups = getGroupsByTournament(db, tournamentRow.id);
  const groupPairs = getGroupPairs(db, groups.map((group) => group.id));
  const matches = getMatchesByTournament(db, tournamentRow.id).map((match) => decorateMatch(match, pairMap));
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
    tournament: {
      ...tournamentRow,
      createdAt: tournamentRow.created_at,
      winnerId: tournamentRow.winner_id,
      closedAt: tournamentRow.closed_at,
      scoring: {
        win: tournamentRow.scoring_win,
        loss: tournamentRow.scoring_loss,
        noShow: tournamentRow.scoring_no_show,
      },
      rulesVersion: tournamentRow.rules_version,
    },
    players,
    pairs,
    groups: groups.map((group) => ({
      ...group,
      tournamentId: group.tournament_id,
      pairIds: groupPairs.filter((row) => row.group_id === group.id).map((row) => row.pair_id),
    })),
    matches,
    standings,
    bracket,
    bracketResults,
    bracketChampion: bracketOutcome.champion,
  };
};

const createTournamentSnapshot = (bundle) => ({
  id: randomUUID(),
  archivedAt: new Date().toISOString(),
  tournament: bundle.tournament,
  players: bundle.players,
  pairs: bundle.pairs,
  groups: bundle.groups,
  matches: bundle.matches,
  standings: bundle.standings,
  bracket: bundle.bracket,
  bracketResults: bundle.bracketResults,
  bracketChampion: bundle.bracketChampion,
});

const upsertTournamentSummary = (db, tournamentId, fields) => {
  const current = getTournamentById(db, tournamentId);
  if (!current) {
    return null;
  }

  const nextName = fields.name ?? buildTournamentName(fields.place ?? current.place, fields.date ?? current.date);
  db.prepare(
    `
      UPDATE tournaments
      SET name = ?,
          date = ?,
          mode = ?,
          place = ?,
          status = ?,
          winner_id = ?,
          closed_at = ?,
          scoring_win = ?,
          scoring_loss = ?,
          scoring_no_show = ?,
          rules_version = ?
      WHERE id = ?
    `,
  ).run(
    nextName,
    fields.date ?? current.date ?? '',
    fields.mode ?? current.mode ?? '',
    fields.place ?? current.place ?? '',
    fields.status ?? current.status,
    fields.winnerId ?? current.winner_id ?? null,
    fields.closedAt ?? current.closed_at ?? null,
    fields.scoringWin ?? current.scoring_win ?? 1,
    fields.scoringLoss ?? current.scoring_loss ?? 0,
    fields.scoringNoShow ?? current.scoring_no_show ?? 0,
    fields.rulesVersion ?? current.rules_version ?? 1,
    tournamentId,
  );

  return getTournamentById(db, tournamentId);
};

export const createApiRouter = (db) => {
  const router = express.Router();

  router.post('/auth/login', async (req, res) => {
    const username = normalizeText(req.body?.username);
    const password = String(req.body?.password ?? '');

    if (!username || !password) {
      res.status(400).json({ error: 'username and password are required' });
      return;
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordMatches = await verifyPassword(password, admin.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signSessionToken(admin);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    jsonOk(res, { ok: true, admin: { id: admin.id, username: admin.username } });
  });

  router.post('/auth/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    jsonOk(res, { ok: true });
  });

  router.get('/tournaments/current', (_req, res) => {
    const tournament = getCurrentActiveTournament(db);
    jsonOk(res, loadTournamentBundle(db, tournament));
  });

  router.get('/history', (_req, res) => {
    const entries = db.prepare('SELECT * FROM history ORDER BY datetime(archived_at) DESC, id DESC').all();
    jsonOk(
      res,
      entries.map((entry) => {
        const snapshot = JSON.parse(entry.snapshot_json);
        return {
          id: entry.id,
          tournamentId: entry.tournament_id,
          archivedAt: entry.archived_at,
          tournamentName: snapshot.tournament?.name || '',
          tournamentDate: snapshot.tournament?.date || '',
          tournamentMode: snapshot.tournament?.mode || '',
          tournamentPlace: snapshot.tournament?.place || '',
          winnerId: snapshot.tournament?.winnerId || null,
          winnerName: snapshot.pairs?.find((pair) => pair.id === snapshot.tournament?.winnerId)?.name || null,
          snapshot,
        };
      }),
    );
  });

  router.get('/players', (_req, res) => {
    jsonOk(res, getPlayers(db).map(decoratePlayer));
  });

  router.post('/players', requireAdmin, (req, res) => {
    const firstName = normalizeText(req.body?.first_name ?? req.body?.firstName);
    const lastName = normalizeText(req.body?.last_name ?? req.body?.lastName);
    const nickname = normalizeText(req.body?.nickname ?? '');

    if (!firstName || !lastName) {
      res.status(400).json({ error: 'first_name and last_name are required' });
      return;
    }

    const player = {
      id: req.body?.id || randomUUID(),
      first_name: firstName,
      last_name: lastName,
      nickname: nickname || null,
      full_name: `${firstName} ${lastName}`.trim(),
    };

    db.prepare(
      `
        INSERT INTO players (id, first_name, last_name, nickname, full_name)
        VALUES (@id, @first_name, @last_name, @nickname, @full_name)
      `,
    ).run(player);

    jsonOk(res, decoratePlayer(player), 201);
  });

  router.put('/players/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const firstName = normalizeText(req.body?.first_name ?? req.body?.firstName ?? existing.first_name);
    const lastName = normalizeText(req.body?.last_name ?? req.body?.lastName ?? existing.last_name);
    const nickname = normalizeText(req.body?.nickname ?? existing.nickname ?? '');

    db.prepare(
      `
        UPDATE players
        SET first_name = ?, last_name = ?, nickname = ?, full_name = ?
        WHERE id = ?
      `,
    ).run(firstName, lastName, nickname || null, `${firstName} ${lastName}`.trim(), req.params.id);

    const updated = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
    jsonOk(res, decoratePlayer(updated));
  });

  router.delete('/players/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
    jsonOk(res, { ok: true });
  });

  router.get('/pairs', (_req, res) => {
    const tournament = getCurrentActiveTournament(db);
    if (!tournament) {
      jsonOk(res, []);
      return;
    }

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    jsonOk(res, getPairsByTournament(db, tournament.id).map((pair) => decoratePair(pair, playerMap)));
  });

  router.post('/pairs', requireAdmin, (req, res) => {
    const tournament = getCurrentActiveTournament(db);
    if (!tournament) {
      res.status(409).json({ error: 'Create a tournament first' });
      return;
    }

    const playerOneId = String(req.body?.player_one_id ?? req.body?.playerOneId ?? '').trim();
    const playerTwoId = String(req.body?.player_two_id ?? req.body?.playerTwoId ?? '').trim();
    const name = normalizeText(req.body?.name ?? '');

    if (!playerOneId || !playerTwoId || playerOneId === playerTwoId) {
      res.status(400).json({ error: 'Two distinct players are required' });
      return;
    }

    const playerCount = db.prepare('SELECT COUNT(*) AS count FROM players WHERE id IN (?, ?)').get(playerOneId, playerTwoId);
    if (playerCount.count !== 2) {
      res.status(400).json({ error: 'Both players must exist' });
      return;
    }

    const pair = {
      id: req.body?.id || randomUUID(),
      tournament_id: tournament.id,
      name: name || 'Pareja nueva',
      player_one_id: playerOneId,
      player_two_id: playerTwoId,
    };

    db.prepare(
      `
        INSERT INTO pairs (id, tournament_id, name, player_one_id, player_two_id)
        VALUES (@id, @tournament_id, @name, @player_one_id, @player_two_id)
      `,
    ).run(pair);

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    jsonOk(res, decoratePair(pair, playerMap), 201);
  });

  router.put('/pairs/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM pairs WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Pair not found' });
      return;
    }

    const tournament = getTournamentById(db, existing.tournament_id);
    if (tournament?.status === 'Torneo archivado') {
      res.status(409).json({ error: 'Archived tournaments cannot be edited' });
      return;
    }

    const playerOneId = normalizeText(req.body?.player_one_id ?? req.body?.playerOneId ?? existing.player_one_id);
    const playerTwoId = normalizeText(req.body?.player_two_id ?? req.body?.playerTwoId ?? existing.player_two_id);
    const name = normalizeText(req.body?.name ?? existing.name);

    if (!playerOneId || !playerTwoId || playerOneId === playerTwoId) {
      res.status(400).json({ error: 'Two distinct players are required' });
      return;
    }

    db.prepare(
      `
        UPDATE pairs
        SET name = ?, player_one_id = ?, player_two_id = ?
        WHERE id = ?
      `,
    ).run(name || existing.name, playerOneId, playerTwoId, req.params.id);

    const players = getPlayers(db).map(decoratePlayer);
    const playerMap = new Map(players.map((player) => [player.id, player]));
    const updated = db.prepare('SELECT * FROM pairs WHERE id = ?').get(req.params.id);
    jsonOk(res, decoratePair(updated, playerMap));
  });

  router.delete('/pairs/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM pairs WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Pair not found' });
      return;
    }

    const tournament = getTournamentById(db, existing.tournament_id);
    if (tournament?.status === 'Torneo archivado') {
      res.status(409).json({ error: 'Archived tournaments cannot be edited' });
      return;
    }

    db.prepare('DELETE FROM pairs WHERE id = ?').run(req.params.id);
    jsonOk(res, { ok: true });
  });

  router.post('/tournaments', requireAdmin, (req, res) => {
    const currentActive = getCurrentActiveTournament(db);
    if (currentActive) {
      res.status(409).json({ error: 'An active tournament already exists' });
      return;
    }

    const date = String(req.body?.date ?? '').trim();
    const mode = String(req.body?.mode ?? '').trim();
    const place = normalizeText(req.body?.place);

    if (!date || !mode || !place) {
      res.status(400).json({ error: 'date, mode and place are required' });
      return;
    }

    const tournament = {
      id: req.body?.id || randomUUID(),
      name: normalizeText(req.body?.name) || buildTournamentName(place, date),
      date,
      mode,
      place,
      status: 'Torneo activo',
      created_at: new Date().toISOString(),
      winner_id: null,
      closed_at: null,
      scoring_win: Number(req.body?.scoring_win ?? 1),
      scoring_loss: Number(req.body?.scoring_loss ?? 0),
      scoring_no_show: Number(req.body?.scoring_no_show ?? 0),
      rules_version: Number(req.body?.rules_version ?? 1),
    };

    db.prepare(
      `
        INSERT INTO tournaments
          (id, name, date, mode, place, status, created_at, winner_id, closed_at, scoring_win, scoring_loss, scoring_no_show, rules_version)
        VALUES
          (@id, @name, @date, @mode, @place, @status, @created_at, @winner_id, @closed_at, @scoring_win, @scoring_loss, @scoring_no_show, @rules_version)
      `,
    ).run(tournament);

    jsonOk(res, loadTournamentBundle(db, tournament), 201);
  });

  router.put('/tournaments/:id', requireAdmin, (req, res) => {
    const existing = getTournamentById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    const updated = upsertTournamentSummary(db, req.params.id, {
      name: req.body?.name,
      date: req.body?.date,
      mode: req.body?.mode,
      place: req.body?.place,
      status: req.body?.status,
      winnerId: req.body?.winner_id ?? req.body?.winnerId,
      closedAt: req.body?.closed_at ?? req.body?.closedAt,
      scoringWin: req.body?.scoring_win ?? req.body?.scoringWin,
      scoringLoss: req.body?.scoring_loss ?? req.body?.scoringLoss,
      scoringNoShow: req.body?.scoring_no_show ?? req.body?.scoringNoShow,
      rulesVersion: req.body?.rules_version ?? req.body?.rulesVersion,
    });

    jsonOk(res, loadTournamentBundle(db, updated));
  });

  router.delete('/tournaments/:id', requireAdmin, (req, res) => {
    const existing = getTournamentById(db, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    db.prepare('DELETE FROM history WHERE tournament_id = ?').run(req.params.id);
    db.prepare('DELETE FROM tournaments WHERE id = ?').run(req.params.id);
    jsonOk(res, { ok: true });
  });

  router.post('/tournaments/:id/plan', requireAdmin, (req, res) => {
    const tournament = getTournamentById(db, req.params.id);
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    if (tournament.status === 'Torneo archivado') {
      res.status(409).json({ error: 'Archived tournaments cannot be planned again' });
      return;
    }

    const pairs = getPairsByTournament(db, tournament.id);
    if (pairs.length < 2) {
      res.status(400).json({ error: 'At least two pairs are required' });
      return;
    }

    const groupCount = pairs.length >= 13 ? 4 : pairs.length >= 9 ? 3 : 2;
    const groups = buildBalancedGroups(pairs, groupCount);
    const matches = buildBalancedCrossGroupFixtures(pairs, groups, 2);

    const deleteGroupIds = db.prepare('SELECT id FROM groups WHERE tournament_id = ?').all(tournament.id).map((row) => row.id);
    const deleteMatchIds = db.prepare('SELECT id FROM matches WHERE tournament_id = ?').all(tournament.id).map((row) => row.id);

    const transaction = db.transaction(() => {
      if (deleteMatchIds.length) {
        db.prepare(`DELETE FROM matches WHERE tournament_id = ?`).run(tournament.id);
      }

      if (deleteGroupIds.length) {
        db.prepare(`DELETE FROM groups WHERE tournament_id = ?`).run(tournament.id);
      }

      groups.forEach((group) => {
        db.prepare('INSERT INTO groups (id, tournament_id, name) VALUES (?, ?, ?)').run(group.id, tournament.id, group.name);
        group.pairIds.forEach((pairId) => {
          db.prepare('INSERT INTO group_pairs (group_id, pair_id) VALUES (?, ?)').run(group.id, pairId);
        });
      });

      matches.forEach((match) => {
        db.prepare(
          `
            INSERT INTO matches
              (id, tournament_id, stage, pair_a_id, pair_b_id, date, time, venue, score_a, score_b, sets_a, sets_b, games_a, games_b, played, winner_id)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          match.id,
          tournament.id,
          match.stage,
          match.pairAId,
          match.pairBId,
          match.date || '',
          match.time || '',
          match.venue || '',
          match.scoreA,
          match.scoreB,
          match.setsA,
          match.setsB,
          match.gamesA,
          match.gamesB,
          Number(Boolean(match.played)),
          match.winnerId || null,
        );
      });

      db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('Torneo planificado', tournament.id);
    });

    transaction();
    jsonOk(res, loadTournamentBundle(db, getTournamentById(db, tournament.id)));
  });

  router.put('/matches/:id', requireAdmin, (req, res) => {
    const existing = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const tournament = getTournamentById(db, existing.tournament_id);
    if (tournament?.status === 'Torneo archivado') {
      res.status(409).json({ error: 'Archived tournaments cannot be edited' });
      return;
    }

    const update = buildMatchUpdate(existing, req.body || {});
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

    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
    const pairMap = new Map(getPairsByTournament(db, tournament.id).map((pair) => [pair.id, pair]));
    jsonOk(res, decorateMatch(updated, pairMap));

  });
  router.post('/tournaments/:id/archive', requireAdmin, (req, res) => {
    const tournament = getTournamentById(db, req.params.id);
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    if (tournament.status === 'Torneo archivado') {
      res.status(409).json({ error: 'Tournament already archived' });
      return;
    }

    const bundleBeforeArchive = loadTournamentBundle(db, tournament);
    const winnerId =
      normalizeText(req.body?.winner_id ?? req.body?.winnerId) ||
      bundleBeforeArchive.bracketChampion?.winnerId ||
      tournament.winner_id ||
      null;

    if (!winnerId) {
      res.status(409).json({ error: 'Tournament winner is required before archiving' });
      return;
    }

    const archivedTournament = upsertTournamentSummary(db, tournament.id, {
      status: 'Torneo archivado',
      winnerId,
      closedAt: new Date().toISOString(),
    });

    const finalBundle = loadTournamentBundle(db, archivedTournament);
    const snapshot = createTournamentSnapshot(finalBundle);

    db.prepare(
      `
        INSERT INTO history (id, tournament_id, archived_at, snapshot_json)
        VALUES (?, ?, ?, ?)
      `,
    ).run(snapshot.id, archivedTournament.id, snapshot.archivedAt, JSON.stringify(snapshot));

    jsonOk(res, { ok: true, tournament: finalBundle.tournament, snapshot });
  });

  return router;
};




