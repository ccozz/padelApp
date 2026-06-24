import { defaultState } from './constants.js';

const API_BASE = '/api';

const toTrimmedString = (value) => String(value ?? '').trim();

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const cloneDefaultState = () => defaultState();

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '');

  if (!response.ok) {
    const error = new Error(
      (isObject(payload) && (payload.error || payload.message)) ||
        (typeof payload === 'string' && payload.trim()) ||
        `HTTP ${response.status}`,
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const normalizePlayerRecord = (player) => {
  const firstName = toTrimmedString(player?.firstName ?? player?.first_name ?? '');
  const lastName = toTrimmedString(player?.lastName ?? player?.last_name ?? '');
  const nickname = toTrimmedString(player?.nickname ?? '');
  const fullName = toTrimmedString(player?.fullName ?? player?.full_name ?? `${firstName} ${lastName}`);

  return {
    id: toTrimmedString(player?.id ?? ''),
    firstName,
    lastName,
    nickname,
    fullName,
    createdAt: player?.createdAt ?? player?.created_at ?? null,
    updatedAt: player?.updatedAt ?? player?.updated_at ?? null,
  };
};

const normalizePairPlayer = (player) => {
  if (!player) {
    return null;
  }

  return normalizePlayerRecord(player);
};

const normalizePairRecord = (pair) => {
  const playerOne = normalizePairPlayer(pair?.playerOne);
  const playerTwo = normalizePairPlayer(pair?.playerTwo);

  return {
    id: toTrimmedString(pair?.id ?? ''),
    tournamentId: toTrimmedString(pair?.tournamentId ?? pair?.tournament_id ?? ''),
    name: toTrimmedString(pair?.name ?? ''),
    playerOneId: toTrimmedString(pair?.playerOneId ?? pair?.player_one_id ?? ''),
    playerTwoId: toTrimmedString(pair?.playerTwoId ?? pair?.player_two_id ?? ''),
    playerOne,
    playerTwo,
    players: [playerOne, playerTwo].filter(Boolean),
    createdAt: pair?.createdAt ?? pair?.created_at ?? null,
    updatedAt: pair?.updatedAt ?? pair?.updated_at ?? null,
  };
};

const normalizeGroupRecord = (group) => ({
  id: toTrimmedString(group?.id ?? ''),
  tournamentId: toTrimmedString(group?.tournamentId ?? group?.tournament_id ?? ''),
  name: toTrimmedString(group?.name ?? ''),
  pairIds: Array.isArray(group?.pairIds) ? group.pairIds.map((value) => toTrimmedString(value)).filter(Boolean) : [],
});

const normalizeMatchRecord = (match) => ({
  id: toTrimmedString(match?.id ?? ''),
  tournamentId: toTrimmedString(match?.tournamentId ?? match?.tournament_id ?? ''),
  stage: toTrimmedString(match?.stage ?? ''),
  pairAId: toTrimmedString(match?.pairAId ?? match?.pair_a_id ?? ''),
  pairBId: toTrimmedString(match?.pairBId ?? match?.pair_b_id ?? ''),
  pairALabel: toTrimmedString(match?.pairALabel ?? ''),
  pairBLabel: toTrimmedString(match?.pairBLabel ?? ''),
  date: toTrimmedString(match?.date ?? ''),
  time: toTrimmedString(match?.time ?? ''),
  venue: toTrimmedString(match?.venue ?? ''),
  scoreA: match?.scoreA ?? match?.score_a ?? null,
  scoreB: match?.scoreB ?? match?.score_b ?? null,
  setsA: match?.setsA ?? match?.sets_a ?? null,
  setsB: match?.setsB ?? match?.sets_b ?? null,
  gamesA: match?.gamesA ?? match?.games_a ?? null,
  gamesB: match?.gamesB ?? match?.games_b ?? null,
  winnerId: toTrimmedString(match?.winnerId ?? match?.winner_id ?? ''),
  played: Boolean(match?.played),
});

const normalizeTournamentRecord = (tournament) => ({
  id: toTrimmedString(tournament?.id ?? ''),
  name: toTrimmedString(tournament?.name ?? ''),
  date: toTrimmedString(tournament?.date ?? ''),
  mode: toTrimmedString(tournament?.mode ?? ''),
  place: toTrimmedString(tournament?.place ?? ''),
  status: toTrimmedString(tournament?.status ?? ''),
  createdAt: tournament?.createdAt ?? tournament?.created_at ?? null,
  winnerId: toTrimmedString(tournament?.winnerId ?? tournament?.winner_id ?? ''),
  closedAt: tournament?.closedAt ?? tournament?.closed_at ?? null,
  scoring: {
    win: Number(tournament?.scoring?.win ?? tournament?.scoring_win ?? 1),
    loss: Number(tournament?.scoring?.loss ?? tournament?.scoring_loss ?? 0),
    noShow: Number(tournament?.scoring?.noShow ?? tournament?.scoring_no_show ?? 0),
  },
  rulesVersion: Number(tournament?.rulesVersion ?? tournament?.rules_version ?? 1),
});

const normalizeHistoryEntry = (entry) => {
  const snapshot = entry?.snapshot ?? {};
  const tournament = normalizeTournamentRecord(snapshot.tournament ?? entry.tournament ?? {});
  const pairs = Array.isArray(snapshot.pairs ?? entry.pairs) ? (snapshot.pairs ?? entry.pairs).map(normalizePairRecord) : [];
  const matches = Array.isArray(snapshot.matches ?? entry.matches) ? (snapshot.matches ?? entry.matches).map(normalizeMatchRecord) : [];

  return {
    id: toTrimmedString(entry?.id ?? snapshot?.id ?? tournament.id ?? ''),
    tournamentId: toTrimmedString(entry?.tournamentId ?? entry?.tournament_id ?? tournament.id ?? ''),
    archivedAt: toTrimmedString(entry?.archivedAt ?? entry?.archived_at ?? tournament.closedAt ?? tournament.createdAt ?? ''),
    tournament,
    pairs,
    matches,
    standings: Array.isArray(snapshot.standings) ? snapshot.standings : [],
    bracket: Array.isArray(snapshot.bracket) ? snapshot.bracket : [],
    bracketResults: Array.isArray(snapshot.bracketResults) ? snapshot.bracketResults : [],
    bracketChampion: snapshot.bracketChampion ?? null,
    snapshot,
    winnerId: toTrimmedString(entry?.winnerId ?? snapshot?.tournament?.winnerId ?? tournament.winnerId ?? ''),
    tournamentName: toTrimmedString(entry?.tournamentName ?? tournament.name ?? ''),
    tournamentDate: toTrimmedString(entry?.tournamentDate ?? tournament.date ?? ''),
    tournamentMode: toTrimmedString(entry?.tournamentMode ?? tournament.mode ?? ''),
    tournamentPlace: toTrimmedString(entry?.tournamentPlace ?? tournament.place ?? ''),
    winnerName: toTrimmedString(entry?.winnerName ?? ''),
  };
};

const normalizeList = (items, normalizer) => (Array.isArray(items) ? items.map(normalizer) : []);

export const loadState = async () => {
  const [bundle, playersResponse, pairsResponse, historyResponse] = await Promise.all([
    requestJson('/tournaments/current'),
    requestJson('/players'),
    requestJson('/pairs'),
    requestJson('/history'),
  ]);

  const fallbackPlayers = normalizeList(playersResponse, normalizePlayerRecord);
  const fallbackPairs = normalizeList(pairsResponse, normalizePairRecord);
  const bundlePlayers = normalizeList(bundle?.players, normalizePlayerRecord);
  const bundlePairs = normalizeList(bundle?.pairs, normalizePairRecord);

  return {
    ...cloneDefaultState(),
    tournament: bundle?.tournament ? normalizeTournamentRecord(bundle.tournament) : cloneDefaultState().tournament,
    players: bundlePlayers.length ? bundlePlayers : fallbackPlayers,
    pairs: bundlePairs.length ? bundlePairs : fallbackPairs,
    groups: normalizeList(bundle?.groups, normalizeGroupRecord),
    matches: normalizeList(bundle?.matches, normalizeMatchRecord),
    standings: Array.isArray(bundle?.standings) ? bundle.standings : [],
    bracket: Array.isArray(bundle?.bracket) ? bundle.bracket : [],
    history: normalizeList(historyResponse, normalizeHistoryEntry),
    bracketResults: Array.isArray(bundle?.bracketResults) ? bundle.bracketResults : [],
    bracketChampion: bundle?.bracketChampion ?? null,
  };
};

export const createPlayer = (payload) =>
  requestJson('/players', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updatePlayer = (id, payload) =>
  requestJson(`/players/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const deletePlayer = (id) =>
  requestJson(`/players/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const createPair = (payload) =>
  requestJson('/pairs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updatePair = (id, payload) =>
  requestJson(`/pairs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const deletePair = (id) =>
  requestJson(`/pairs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const createTournament = (payload) =>
  requestJson('/tournaments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateTournament = (id, payload) =>
  requestJson(`/tournaments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const deleteTournament = (id) =>
  requestJson(`/tournaments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const planTournament = (id) =>
  requestJson(`/tournaments/${encodeURIComponent(id)}/plan`, {
    method: 'POST',
  });

export const archiveTournament = (id, winnerId) =>
  requestJson(`/tournaments/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    body: JSON.stringify({ winnerId }),
  });

export const updateMatch = (id, payload) =>
  requestJson(`/matches/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const createId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `pair-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
