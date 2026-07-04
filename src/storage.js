import { defaultState } from './constants.js';

const API_BASE = '/api';

const cloneDefaultState = () => defaultState();

const toTrimmedString = (value) => String(value ?? '').trim();
const toBoolean = (value) => Boolean(value);
const toNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

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
    email: toTrimmedString(player?.email ?? '') || null,
    emailVerified: Boolean(player?.emailVerified ?? player?.email_verified),
    accountStatus: toTrimmedString(player?.accountStatus ?? player?.account_status ?? 'sin_cuenta'),
    createdAt: player?.createdAt ?? player?.created_at ?? null,
    updatedAt: player?.updatedAt ?? player?.updated_at ?? null,
  };
};

const normalizePairRecord = (pair) => {
  const playerOne = pair?.playerOne ? normalizePlayerRecord(pair.playerOne) : null;
  const playerTwo = pair?.playerTwo ? normalizePlayerRecord(pair.playerTwo) : null;

  return {
    id: toTrimmedString(pair?.id ?? ''),
    categoryId: toTrimmedString(pair?.categoryId ?? pair?.category_id ?? ''),
    name: toTrimmedString(pair?.name ?? ''),
    playerOneId: toTrimmedString(pair?.playerOneId ?? pair?.player_one_id ?? ''),
    playerTwoId: toTrimmedString(pair?.playerTwoId ?? pair?.player_two_id ?? ''),
    playerOne,
    playerTwo,
    players: [playerOne, playerTwo].filter(Boolean),
  };
};

const normalizeGroupRecord = (group) => ({
  id: toTrimmedString(group?.id ?? ''),
  categoryId: toTrimmedString(group?.categoryId ?? group?.category_id ?? ''),
  name: toTrimmedString(group?.name ?? ''),
  pairIds: Array.isArray(group?.pairIds ?? group?.pair_ids) ? (group?.pairIds ?? group?.pair_ids).map((value) => toTrimmedString(value)).filter(Boolean) : [],
  pairs: Array.isArray(group?.pairs) ? group.pairs.map(normalizePairRecord) : [],
});

const normalizeMatchRecord = (match) => ({
  id: toTrimmedString(match?.id ?? ''),
  categoryId: toTrimmedString(match?.categoryId ?? match?.category_id ?? ''),
  stage: toTrimmedString(match?.stage ?? ''),
  pairAId: toTrimmedString(match?.pairAId ?? match?.pair_a_id ?? ''),
  pairBId: toTrimmedString(match?.pairBId ?? match?.pair_b_id ?? ''),
  pairALabel: toTrimmedString(match?.pairALabel ?? match?.pair_a_label ?? ''),
  pairBLabel: toTrimmedString(match?.pairBLabel ?? match?.pair_b_label ?? ''),
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
  played: toBoolean(match?.played),
  roundName: toTrimmedString(match?.roundName ?? ''),
});

const normalizeWaitlistRecord = (entry) => ({
  id: toTrimmedString(entry?.id ?? ''),
  categoryId: toTrimmedString(entry?.categoryId ?? entry?.category_id ?? ''),
  playerId: toTrimmedString(entry?.playerId ?? entry?.player_id ?? ''),
  partnerId: toTrimmedString(entry?.partnerId ?? entry?.partner_id ?? ''),
  requestedAt: toTrimmedString(entry?.requestedAt ?? entry?.requested_at ?? ''),
  status: toTrimmedString(entry?.status ?? ''),
  player: entry?.player ? normalizePlayerRecord(entry.player) : null,
  partner: entry?.partner ? normalizePlayerRecord(entry.partner) : null,
});

const normalizeCategoryRecord = (category) => ({
  id: toTrimmedString(category?.id ?? ''),
  eventId: toTrimmedString(category?.eventId ?? category?.event_id ?? ''),
  name: toTrimmedString(category?.name ?? ''),
  status: toTrimmedString(category?.status ?? ''),
  maxPairs: category?.maxPairs ?? category?.max_pairs ?? null,
  winnerPairId: toTrimmedString(category?.winnerPairId ?? category?.winner_pair_id ?? ''),
  closedAt: category?.closedAt ?? category?.closed_at ?? null,
  scoring: {
    win: toNumber(category?.scoring?.win ?? category?.scoring_win, 1),
    loss: toNumber(category?.scoring?.loss ?? category?.scoring_loss, 0),
    noShow: toNumber(category?.scoring?.noShow ?? category?.scoring_no_show, 0),
  },
  rulesVersion: toNumber(category?.rulesVersion ?? category?.rules_version, 1),
});

const normalizeHistoryCategory = (entry) => ({
  category: normalizeCategoryRecord(entry?.category ?? {}),
  archivedAt: toTrimmedString(entry?.archivedAt ?? entry?.archived_at ?? ''),
  snapshot: entry?.snapshot ?? null,
});

const normalizeHistoryEntry = (entry) => ({
  event: normalizeEventRecord(entry?.event ?? {}),
  categories: Array.isArray(entry?.categories) ? entry.categories.map(normalizeHistoryCategory) : [],
});

const normalizeCategoryBundle = (bundle) => {
  const category = normalizeCategoryRecord(bundle?.category ?? bundle ?? {});

  return {
    ...category,
    pairs: Array.isArray(bundle?.pairs) ? bundle.pairs.map(normalizePairRecord) : [],
    groups: Array.isArray(bundle?.groups) ? bundle.groups.map(normalizeGroupRecord) : [],
    matches: Array.isArray(bundle?.matches) ? bundle.matches.map(normalizeMatchRecord) : [],
    standings: Array.isArray(bundle?.standings) ? bundle.standings : [],
    bracket: Array.isArray(bundle?.bracket) ? bundle.bracket : [],
    bracketResults: Array.isArray(bundle?.bracketResults) ? bundle.bracketResults : [],
    bracketChampion: bundle?.bracketChampion ?? null,
    waitlist: Array.isArray(bundle?.waitlist) ? bundle.waitlist.map(normalizeWaitlistRecord) : [],
  };
};

const normalizeEventRecord = (event) => ({
  id: toTrimmedString(event?.id ?? ''),
  name: toTrimmedString(event?.name ?? ''),
  date: toTrimmedString(event?.date ?? ''),
  mode: toTrimmedString(event?.mode ?? ''),
  place: toTrimmedString(event?.place ?? ''),
  status: toTrimmedString(event?.status ?? ''),
  createdAt: event?.createdAt ?? event?.created_at ?? null,
  winnerId: toTrimmedString(event?.winnerId ?? event?.winner_id ?? ''),
  closedAt: event?.closedAt ?? event?.closed_at ?? null,
  scoring: {
    win: toNumber(event?.scoring?.win ?? event?.scoring_win, 1),
    loss: toNumber(event?.scoring?.loss ?? event?.scoring_loss, 0),
    noShow: toNumber(event?.scoring?.noShow ?? event?.scoring_no_show, 0),
  },
  rulesVersion: toNumber(event?.rulesVersion ?? event?.rules_version, 1),
});

const normalizeList = (items, normalizer) => (Array.isArray(items) ? items.map(normalizer) : []);

const pickSelectedCategoryId = (categories) =>
  categories.find((category) => category.status !== 'Torneo archivado')?.id || categories[0]?.id || null;

export const loadState = async () => {
  const [bundle, historyResponse] = await Promise.all([requestJson('/events/current'), requestJson('/history')]);
  const event = normalizeEventRecord(bundle?.event ?? {});
  const players = normalizeList(bundle?.players, normalizePlayerRecord);
  const categories = normalizeList(bundle?.categories, normalizeCategoryBundle);
  const selectedCategoryId = pickSelectedCategoryId(categories);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) || null;

  return {
    ...cloneDefaultState(),
    event,
    players,
    categories,
    selectedCategoryId,
    selectedCategory,
    pairs: selectedCategory?.pairs || [],
    groups: selectedCategory?.groups || [],
    matches: selectedCategory?.matches || [],
    standings: selectedCategory?.standings || [],
    bracket: selectedCategory?.bracket || [],
    bracketResults: selectedCategory?.bracketResults || [],
    bracketChampion: selectedCategory?.bracketChampion || null,
    history: normalizeList(historyResponse, normalizeHistoryEntry),
  };
};

export const createEvent = (payload) =>
  requestJson('/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateEvent = (id, payload) =>
  requestJson(`/events/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const deleteEvent = (id) =>
  requestJson(`/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const createCategory = (eventId, payload) =>
  requestJson(`/events/${encodeURIComponent(eventId)}/categories`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateCategory = (id, payload) =>
  requestJson(`/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const deleteCategory = (id) =>
  requestJson(`/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

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

export const planCategory = (id) =>
  requestJson(`/categories/${encodeURIComponent(id)}/plan`, {
    method: 'POST',
  });

export const archiveCategory = (id, payload = {}) =>
  requestJson(`/categories/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateMatch = (id, payload) =>
  requestJson(`/matches/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const getCategoryInscriptionState = (id) =>
  requestJson(`/categories/${encodeURIComponent(id)}/inscriptions`);

export const inscribeCategory = (id, partnerId) =>
  requestJson(`/categories/${encodeURIComponent(id)}/inscriptions`, {
    method: 'POST',
    body: JSON.stringify({ partnerId }),
  });

export const addToWaitlist = (id, partnerId) =>
  requestJson(`/categories/${encodeURIComponent(id)}/waitlist`, {
    method: 'POST',
    body: JSON.stringify({ partnerId }),
  });

export const revokeInscription = (categoryId, pairId) =>
  requestJson(`/categories/${encodeURIComponent(categoryId)}/inscriptions/${encodeURIComponent(pairId)}`, {
    method: 'DELETE',
  });

export const createId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
