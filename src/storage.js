import { STORAGE_KEY, defaultState } from './constants.js';

export const loadState = () => {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) {
      return defaultState();
    }

    const parsedState = JSON.parse(rawState);
    const pairs = Array.isArray(parsedState.pairs) ? parsedState.pairs : [];
    const players = Array.isArray(parsedState.players) && parsedState.players.length
      ? parsedState.players.map(normalizePlayerRecord)
      : collectPlayersFromPairs(pairs);

    return {
      ...defaultState(),
      ...parsedState,
      tournament: {
        ...defaultState().tournament,
        ...(parsedState.tournament || {}),
      },
      players,
      pairs: pairs.map((pair) => hydratePair(pair, players)),
      history: Array.isArray(parsedState.history) ? parsedState.history : [],
      bracketResults: Array.isArray(parsedState.bracketResults) ? parsedState.bracketResults : [],
    };
  } catch {
    return defaultState();
  }
};

const collectPlayersFromPairs = (pairs) => {
  const playerMap = new Map();

  pairs.forEach((pair) => {
    [pair.playerOne, pair.playerTwo].forEach((playerName) => {
      const cleanName = typeof playerName === 'string' ? playerName.trim() : '';
      if (!cleanName || playerMap.has(cleanName.toLowerCase())) {
        return;
      }

      playerMap.set(cleanName.toLowerCase(), {
        id: createId(),
        firstName: cleanName.split(' ')[0] || cleanName,
        lastName: cleanName.split(' ').slice(1).join(' '),
        nickname: '',
        fullName: cleanName,
      });
    });
  });

  return [...playerMap.values()].map(normalizePlayerRecord);
};

const hydratePair = (pair, players) => {
  const playerOne = players.find((entry) => entry.id === pair.playerOneId) || players.find((entry) => entry.fullName === pair.playerOne);
  const playerTwo = players.find((entry) => entry.id === pair.playerTwoId) || players.find((entry) => entry.fullName === pair.playerTwo);

  return {
    ...pair,
    playerOneId: pair.playerOneId || playerOne?.id || null,
    playerTwoId: pair.playerTwoId || playerTwo?.id || null,
    playerOne: pair.playerOne || playerOne?.fullName || '',
    playerTwo: pair.playerTwo || playerTwo?.fullName || '',
  };
};

const normalizePlayerRecord = (player) => {
  const fullName = typeof player?.fullName === 'string' ? player.fullName.trim() : '';
  const firstName = typeof player?.firstName === 'string' ? player.firstName.trim() : '';
  const lastName = typeof player?.lastName === 'string' ? player.lastName.trim() : '';
  const nickname = typeof player?.nickname === 'string' ? player.nickname.trim() : '';
  const derivedParts = fullName ? fullName.split(' ') : [];

  return {
    id: player?.id || createId(),
    firstName: firstName || derivedParts[0] || '',
    lastName: lastName || derivedParts.slice(1).join(' ') || '',
    nickname,
    fullName: fullName || [firstName, lastName].filter(Boolean).join(' ').trim(),
  };
};

export const saveState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const createId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `pair-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeText = (value) => value.trim().replace(/\s+/g, ' ');
