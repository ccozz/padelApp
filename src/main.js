import { defaultState, rules } from './constants.js';
import { isAdminUnlocked, lockAdmin, unlockAdmin } from './auth.js';
import { createId, loadState, normalizeText, saveState } from './storage.js';
import {
  buildBalancedCrossGroupFixtures,
  buildBalancedGroups,
  buildKnockoutBracket,
  buildStandings,
  flattenBracket,
  resolveBracketWinner,
} from './tournament.js';

const tabButtons = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const rulesList = document.getElementById('rulesList');
const pairsList = document.getElementById('pairsList');
const groupsList = document.getElementById('groupsList');
const matchesList = document.getElementById('matchesList');
const standingsList = document.getElementById('standingsList');
const podiumList = document.getElementById('podiumList');
const podiumSection = document.getElementById('podiumSection');
const bracketList = document.getElementById('bracketList');
const bracketResultsList = document.getElementById('bracketResultsList');
const tournamentInfoTitle = document.getElementById('tournamentInfoTitle');
const tournamentInfoMeta = document.getElementById('tournamentInfoMeta');

const isTournamentFinalized = () => {
  const currentState = getState();
  return Boolean(currentState.tournament.closedAt) || currentState.tournament.status === 'Torneo archivado';
};

const canArchiveTournament = () => {
  const currentState = getState();
  return Boolean(currentState.bracketChampion?.winnerId) && !isTournamentFinalized();
};
const resultsList = document.getElementById('resultsList');
const historyList = document.getElementById('historyList');
const historyDateFilter = document.getElementById('historyDateFilter');
const historyPlayerFilter = document.getElementById('historyPlayerFilter');
const fixtureStatusFilter = document.getElementById('fixtureStatusFilter');
const fixturePlayerFilter = document.getElementById('fixturePlayerFilter');
const tournamentWinner = document.getElementById('tournamentWinner');
const pairsCount = document.getElementById('pairsCount');
const tournamentStatus = document.getElementById('tournamentStatus');
const pairForm = document.getElementById('pairForm');
const clearPairs = document.getElementById('clearPairs');
const planTournament = document.getElementById('planTournament');
const archiveTournament = document.getElementById('archiveTournament');
const loadSamplePairs = document.getElementById('loadSamplePairs');
const pairId = document.getElementById('pairId');
const pairName = document.getElementById('pairName');
const playerOneSelect = document.getElementById('playerOneSelect');
const playerTwoSelect = document.getElementById('playerTwoSelect');
const playersList = document.getElementById('playersList');
const playerForm = document.getElementById('playerForm');
const playerId = document.getElementById('playerId');
const playerFirstName = document.getElementById('playerFirstName');
const playerLastName = document.getElementById('playerLastName');
const playerAlias = document.getElementById('playerAlias');
const tournamentForm = document.getElementById('tournamentForm');
const tournamentDate = document.getElementById('tournamentDate');
const tournamentMode = document.getElementById('tournamentMode');
const tournamentPlace = document.getElementById('tournamentPlace');
const deleteCurrentTournament = document.getElementById('deleteCurrentTournament');
const adminLock = document.getElementById('adminLock');
const adminContent = document.getElementById('adminContent');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminPassword = document.getElementById('adminPassword');
const adminLogout = document.getElementById('adminLogout');
const adminTab = [...tabButtons].find((button) => button.dataset.tab === 'admin');

const getState = () => loadState();

const rebuildDerivedState = (state) => {
  const standings = buildStandings(state.pairs, state.matches);
  const bracket = buildKnockoutBracket(standings, state.pairs, 8);
  const bracketOutcome = resolveBracketWinner(bracket, state.bracketResults || [], state.pairs);

  return {
    ...state,
    standings,
    bracket,
    bracketResolved: bracketOutcome.played,
    bracketChampion: bracketOutcome.champion,
  };
};

const setState = (nextState) => {
  saveState(rebuildDerivedState(nextState));
  renderAll();
};

const getPairMap = (pairs) => new Map(pairs.map((pair) => [pair.id, pair]));
const getPlayerMap = (players) => new Map(players.map((player) => [player.id, player]));

const getPlayerName = (players, playerIdValue, fallback = '') =>
  players.find((player) => player.id === playerIdValue)?.fullName || fallback || '';

const getPlayerDisplayName = (player) => {
  if (!player) {
    return '';
  }

  if (player.nickname) {
    return `${player.nickname} (${[player.firstName, player.lastName].filter(Boolean).join(' ').trim()})`;
  }

  return [player.firstName, player.lastName].filter(Boolean).join(' ').trim() || player.fullName || '';
};

const getPlayerGroupLabel = (player) => {
  if (!player) {
    return '';
  }

  return player.nickname || [player.firstName, player.lastName].filter(Boolean).join(' ').trim() || player.fullName || '';
};

const getPlayerSearchBlob = (player) =>
  [player?.firstName, player?.lastName, player?.nickname, player?.fullName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const formatTournamentMode = (mode) => {
  if (mode === 'clasico') {
    return 'Clásico';
  }

  if (mode === 'americano') {
    return 'Americano';
  }

  return mode || 'Sin modo';
};

const hasActiveTournament = (state) =>
  Boolean(state.tournament.createdAt) && state.tournament.status !== 'Torneo archivado';

const canEditTournament = () => isAdminUnlocked() && !isTournamentFinalized();

const getMatchWinnerFromScore = (match, setsA, setsB, gamesA, gamesB) => {
  if (!match) {
    return null;
  }

  if (setsA > setsB) {
    return match.pairAId;
  }

  if (setsB > setsA) {
    return match.pairBId;
  }

  if (gamesA > gamesB) {
    return match.pairAId;
  }

  if (gamesB > gamesA) {
    return match.pairBId;
  }

  return null;
};

const buildHistorySnapshot = (state) => ({
  id: createId(),
  archivedAt: new Date().toISOString(),
  tournamentName: state.tournament.name,
  status: state.tournament.status,
  tournamentDate: state.tournament.date || '',
  tournamentMode: state.tournament.mode || '',
  tournamentPlace: state.tournament.place || '',
  winnerId: state.tournament.winnerId || null,
  winnerName: state.pairs.find((pair) => pair.id === state.tournament.winnerId)?.name || null,
  players: state.players,
  pairs: state.pairs,
  groups: state.groups,
  matches: state.matches,
  standings: buildStandings(state.pairs, state.matches),
  bracket: buildKnockoutBracket(buildStandings(state.pairs, state.matches), state.pairs, 8),
  bracketResults: state.bracketResults || [],
  bracketChampion: state.bracketChampion || null,
});

const samplePairs = [
  ['Martina / Sofía', 'Martina López', 'Sofía Romero'],
  ['Lola / Camila', 'Lola Pérez', 'Camila Gil'],
  ['Juli / Mery', 'Juli Gutiérrez', 'Mery Arma'],
  ['Mica / Eli', 'Mica Ernaga', 'Eli Colombo'],
  ['Barby / Ambar', 'Barby Ríos', 'Ambar Moreno'],
  ['Juli / Lore', 'Juli Díaz', 'Lore Martínez'],
  ['Tere / Emi', 'Tere Aramburu', 'Emi Galante'],
  ['Jose / Betu', 'Jose Caielli', 'Betu'],
  ['Flor / Anto', 'Flor López', 'Anto Soqueira'],
  ['Lu / Marti', 'Lu Sayah', 'Marti Roselló'],
  ['Dani / Maga', 'Dani Fernández', 'Maga Palomeque'],
  ['Sil / Agus', 'Sil Pestana', 'Agus Fama'],
  ['Tati / Aldi', 'Tati Yarussi', 'Aldi Lerda'],
];

const renderRules = () => {
  rulesList.innerHTML = rules.map((rule) => `<li>${rule}</li>`).join('');
};

const renderTournamentInfo = () => {
  const state = getState();
  const tournament = state.tournament;

  if (!tournament.createdAt) {
    tournamentInfoTitle.textContent = 'Sin torneo activo';
    tournamentInfoMeta.textContent = 'Creá un torneo desde el panel de admin.';
    return;
  }

  const parts = [
    tournament.date ? new Date(`${tournament.date}T00:00:00`).toLocaleDateString('es-AR') : 'Sin fecha',
    formatTournamentMode(tournament.mode),
    tournament.place || 'Sin lugar',
  ];

  tournamentInfoTitle.textContent = tournament.name || 'Torneo actual';
  tournamentInfoMeta.textContent = `${parts.join(' · ')} · ${tournament.status}`;
};

const renderPlayerOptions = () => {
  const state = getState();
  const players = state.players || [];
  const editingPair = state.pairs.find((pair) => pair.id === pairId.value.trim());
  const options =
    '<option value="">Seleccionar jugador</option>' +
    players
      .map((player) => `<option value="${player.id}">${getPlayerDisplayName(player)}</option>`)
      .join('');

  if (playerOneSelect) {
    playerOneSelect.innerHTML = options;
  }

  if (playerTwoSelect) {
    playerTwoSelect.innerHTML = options;
  }

  if (editingPair) {
    playerOneSelect.value = editingPair.playerOneId || '';
    playerTwoSelect.value = editingPair.playerTwoId || '';
  }
};

const renderPlayers = () => {
  const state = getState();
  const players = [...(state.players || [])].sort((left, right) => left.fullName.localeCompare(right.fullName, 'es'));

  if (players.length === 0) {
    playersList.innerHTML = '<div class="placeholder">Todavia no hay jugadores registrados.</div>';
    return;
  }

  playersList.innerHTML = players
    .map(
      (player) => `
        <article class="pair-item">
          <div>
            <strong>${getPlayerDisplayName(player)}</strong>
            <div class="pair-meta">${player.firstName} ${player.lastName}</div>
          </div>
          <div class="pair-actions">
            <button type="button" class="mini-action" data-player-action="edit" data-player-id="${player.id}">Editar</button>
            <button type="button" class="mini-action is-danger" data-player-action="delete" data-player-id="${player.id}">Borrar</button>
          </div>
        </article>
      `,
    )
    .join('');
};

const renderPairs = () => {
  const state = getState();
  const pairs = state.pairs;
  const players = state.players || [];
  const locked = isTournamentFinalized();
  pairsCount.textContent = String(pairs.length);
  tournamentStatus.textContent = state.tournament.status;

  if (pairs.length === 0) {
    pairsList.innerHTML = '<div class="placeholder">Todavia no hay parejas cargadas.</div>';
    return;
  }

  pairsList.innerHTML = pairs
    .map(
      (pair, index) => `
        <article class="pair-item">
          <div>
            <strong>${pair.name}</strong>
            <div class="pair-meta">${getPlayerDisplayName(players.find((player) => player.id === pair.playerOneId))} / ${getPlayerDisplayName(players.find((player) => player.id === pair.playerTwoId))}</div>
          </div>
          <div class="pair-actions">
            <button type="button" class="mini-action" data-action="edit" data-id="${pair.id}" ${locked ? 'disabled' : ''}>Editar</button>
            <button type="button" class="mini-action is-danger" data-action="delete" data-id="${pair.id}" ${locked ? 'disabled' : ''}>Borrar</button>
            <div class="pair-meta">#${index + 1}</div>
          </div>
        </article>
      `,
    )
    .join('');
};

const renderWinnerSelect = () => {
  const state = getState();
  const pairs = state.pairs;
  const locked = isTournamentFinalized();
  const players = state.players || [];
  const options = pairs
    .map((pair) => {
      const label = `${pair.name} (${getPlayerName(players, pair.playerOneId, pair.playerOne)} / ${getPlayerName(players, pair.playerTwoId, pair.playerTwo)})`;
      return `<option value="${pair.id}" ${state.tournament.winnerId === pair.id ? 'selected' : ''}>${label}</option>`;
    })
    .join('');

  if (pairs.length === 0) {
    tournamentWinner.innerHTML = '<option value="">Sin parejas</option>';
    tournamentWinner.disabled = true;
    return;
  }

  tournamentWinner.disabled = locked;
  tournamentWinner.innerHTML = '<option value="">Seleccionar ganador</option>' + options;
};

const renderGroups = () => {
  const state = getState();
  const pairMap = getPairMap(state.pairs);
  const groupStats = new Map();

  state.matches.forEach((match) => {
    if (!match.played) {
      return;
    }

    const winnerId = match.winnerId || null;
    const participants = [match.pairAId, match.pairBId];

    participants.forEach((pairIdValue) => {
      const current = groupStats.get(pairIdValue) || {
        wins: 0,
        losses: 0,
        setsFor: 0,
        setsAgainst: 0,
        gamesFor: 0,
        gamesAgainst: 0,
      };

      const isWinner = winnerId === pairIdValue;
      const isLoser = winnerId && winnerId !== pairIdValue;

      current.wins += isWinner ? 1 : 0;
      current.losses += isLoser ? 1 : 0;
      current.setsFor += pairIdValue === match.pairAId ? (match.setsA ?? 0) : (match.setsB ?? 0);
      current.setsAgainst += pairIdValue === match.pairAId ? (match.setsB ?? 0) : (match.setsA ?? 0);
      current.gamesFor += pairIdValue === match.pairAId ? (match.gamesA ?? 0) : (match.gamesB ?? 0);
      current.gamesAgainst += pairIdValue === match.pairAId ? (match.gamesB ?? 0) : (match.gamesA ?? 0);

      groupStats.set(pairIdValue, current);
    });
  });

  if (state.groups.length === 0) {
    groupsList.innerHTML = '<div class="placeholder">Todavia no se generaron grupos.</div>';
    return;
  }

  groupsList.innerHTML = state.groups
    .map((group) => {
      const rows = group.pairIds
        .map((pairIdValue) => {
          const pair = pairMap.get(pairIdValue);
          const row = groupStats.get(pairIdValue) || {};

          return {
            id: pairIdValue,
            name: pair?.name || pairIdValue,
            playerOneLabel: getPlayerGroupLabel(players.find((player) => player.id === pair.playerOneId)),
            playerTwoLabel: getPlayerGroupLabel(players.find((player) => player.id === pair.playerTwoId)),
            wins: row.wins || 0,
            losses: row.losses || 0,
            setsDiff: (row.setsFor || 0) - (row.setsAgainst || 0),
            gamesDiff: (row.gamesFor || 0) - (row.gamesAgainst || 0),
          };
        })
        .sort((left, right) => right.wins - left.wins || right.setsDiff - left.setsDiff || right.gamesDiff - left.gamesDiff || left.name.localeCompare(right.name, 'es'));

      return `
        <article class="group-block">
          <div class="group-title">${group.name}</div>
          <div class="group-meta">${row.playerOneLabel} / ${row.playerTwoLabel}</div>
          <div class="group-table-wrap">
            <table class="group-table">
              <colgroup>
                <col class="group-table-name" />
                <col class="group-table-stat" />
                <col class="group-table-stat" />
                <col class="group-table-stat" />
                <col class="group-table-stat" />
              </colgroup>
              <thead>
                <tr>
                  <th>Pareja</th>
                  <th>G</th>
                  <th>P</th>
                  <th>DS</th>
                  <th>DG</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>
                        <td>${row.name}</td>
                        <td>${row.wins}</td>
                        <td>${row.losses}</td>
                        <td>${row.setsDiff}</td>
                        <td>${row.gamesDiff}</td>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </article>
      `;
    })
    .join('');
};

const renderMatches = () => {
  const state = getState();
  const statusFilter = fixtureStatusFilter?.value || 'all';
  const playerFilter = normalizeText(fixturePlayerFilter?.value || '').toLowerCase();
  const players = state.players || [];

  if (state.matches.length === 0) {
    matchesList.innerHTML = '<div class="placeholder">Todavia no hay partidos generados.</div>';
    return;
  }

  const filteredMatches = state.matches.filter((match) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'past' && match.played) ||
      (statusFilter === 'future' && !match.played);

    if (!matchesStatus) {
      return false;
    }

    if (!playerFilter) {
      return true;
    }

    const pairA = players.find((player) => player.id === match.pairAId);
    const pairB = players.find((player) => player.id === match.pairBId);
    const searchBlob = [
      match.pairALabel,
      match.pairBLabel,
      pairA?.firstName,
      pairA?.lastName,
      pairA?.nickname,
      pairA?.fullName,
      pairB?.firstName,
      pairB?.lastName,
      pairB?.nickname,
      pairB?.fullName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchBlob.includes(playerFilter);
  });

  if (filteredMatches.length === 0) {
    matchesList.innerHTML = '<div class="placeholder">No hay partidos para ese filtro.</div>';
    return;
  }

  const matchesByDay = filteredMatches.reduce((accumulator, match) => {
    const dayKey = match.date || 'Sin fecha';
    if (!accumulator.has(dayKey)) {
      accumulator.set(dayKey, []);
    }
    accumulator.get(dayKey).push(match);
    return accumulator;
  }, new Map());

  const orderedDays = [...matchesByDay.keys()].sort((left, right) => {
    if (left === 'Sin fecha') return 1;
    if (right === 'Sin fecha') return -1;
    return left.localeCompare(right);
  });

  matchesList.innerHTML = orderedDays
    .map((dayKey) => {
      const dayMatches = matchesByDay
        .get(dayKey)
        .slice()
        .sort((left, right) => (left.time || '').localeCompare(right.time || '') || left.pairALabel.localeCompare(right.pairALabel, 'es'));

      const title =
        dayKey === 'Sin fecha'
          ? 'Sin fecha asignada'
          : new Date(`${dayKey}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

      return `
        <article class="match-day">
          <div class="match-day-head">${title}</div>
          <div class="stack-list">
            ${dayMatches
              .map(
                (match, index) => `
                  <article class="match-block">
                    <div class="match-title">Partido ${index + 1}</div>
                    <div class="match-meta">${match.pairALabel} vs ${match.pairBLabel}</div>
                    <div class="match-meta">
                      Estado: ${match.played ? 'Jugado' : 'Pendiente'}
                      ${match.played ? ` · Score ${match.setsA}-${match.setsB} / ${match.gamesA}-${match.gamesB}` : ''}
                    </div>
                    <div class="match-meta">
                      ${match.time || match.venue ? `${match.time || 'Sin hora'} · ${match.venue || 'Sin lugar'}` : 'Sin agenda asignada'}
                    </div>
                  </article>
                `,
              )
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');
};

const renderStandings = () => {
  const state = getState();
  const standings = state.standings.length ? state.standings : buildStandings(state.pairs, state.matches);

  if (standings.length === 0) {
    standingsList.innerHTML = '<div class="placeholder">Todavia no hay tabla para mostrar.</div>';
    return;
  }

  standingsList.innerHTML = `
    <div class="group-table-wrap">
      <table class="group-table standings-table">
        <colgroup>
          <col class="group-table-name" />
          <col class="group-table-stat" />
          <col class="group-table-stat" />
          <col class="group-table-stat" />
          <col class="group-table-stat" />
          <col class="group-table-stat" />
          <col class="group-table-stat" />
        </colgroup>
        <thead>
          <tr>
            <th>Pareja</th>
            <th>PJ</th>
            <th class="standings-points-head">PTS</th>
            <th>SETS</th>
            <th>GAMES</th>
            <th>DS</th>
            <th>DG</th>
          </tr>
        </thead>
        <tbody>
          ${standings
            .map(
              (row, index) => `
                <tr class="${index < 8 ? 'standings-qualified' : ''}">
                  <td>${index + 1}. ${row.name}</td>
                  <td>${row.matchesPlayed}</td>
                  <td class="standings-points-cell">${row.points}</td>
                  <td>${row.setsFor}-${row.setsAgainst}</td>
                  <td>${row.gamesFor}-${row.gamesAgainst}</td>
                  <td>${row.setsFor - row.setsAgainst}</td>
                  <td>${row.gamesFor - row.gamesAgainst}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
};

const renderPodium = () => {
  const state = getState();

  const finished = isTournamentFinalized();
  podiumSection.hidden = !finished;
  podiumSection.toggleAttribute('hidden', !finished);
  podiumSection.classList.toggle('is-hidden', !finished);

  if (!finished) {
    podiumList.innerHTML = '';
    return;
  }

  const standings = state.standings.length ? state.standings : buildStandings(state.pairs, state.matches);
  const podium = standings.slice(0, 3);

  if (podium.length === 0) {
    podiumList.innerHTML = '<div class="placeholder">Todavia no hay podio para mostrar.</div>';
    return;
  }

  const podiumMeta = [
    { label: '1°', className: 'gold' },
    { label: '2°', className: 'silver' },
    { label: '3°', className: 'bronze' },
  ];

  podiumList.innerHTML = podium
    .map(
      (row, index) => `
        <article class="podium-item ${podiumMeta[index].className}">
          <div class="podium-rank">${podiumMeta[index].label}</div>
          <div class="podium-name">${row.name}</div>
          <div class="podium-meta">
            Pts: ${row.points} · PJ: ${row.matchesPlayed} · Prom: ${(row.points / Math.max(row.matchesPlayed, 1)).toFixed(2)}
          </div>
        </article>
      `,
    )
    .join('');
};

const renderBracket = () => {
  const state = getState();
  const bracket = state.bracket.length ? state.bracket : buildKnockoutBracket(buildStandings(state.pairs, state.matches), state.pairs, 8);
  const resolvedBracket = resolveBracketWinner(bracket, state.bracketResults || [], state.pairs);

  if (bracket.length === 0) {
    bracketList.innerHTML = '<div class="placeholder">Todavia no hay cuadro generado.</div>';
    return;
  }

  const champion = isTournamentFinalized() && state.tournament.winnerId
    ? state.pairs.find((pair) => pair.id === state.tournament.winnerId)?.name || 'Ganador'
    : resolvedBracket.champion?.winnerName || 'Pendiente';

  bracketList.innerHTML = resolvedBracket.played
    .map(
      (round, index) => `
        <article class="bracket-round">
          <div class="bracket-header">
            <div class="bracket-title">${round.name}</div>
            <div class="bracket-step">Fase ${index + 1}</div>
          </div>
          <div class="bracket-track">
            ${round.matches
              .map(
                (match, matchIndex) => `
                  <div class="bracket-match ${matchIndex === 0 ? 'bracket-match--lead' : ''}">
                    <div class="bracket-match-top">
                      <span class="bracket-seed">${index + 1}.${matchIndex + 1}</span>
                      <span class="bracket-state">${match.ready ? (match.played ? 'Jugado' : 'Listo') : 'Pendiente'}</span>
                    </div>
                    <div class="bracket-teams">
                      <strong>${match.pairALabel}</strong>
                      <span>vs</span>
                      <strong>${match.pairBLabel}</strong>
                    </div>
                    <div class="bracket-meta">
                      ${match.played ? `Ganador: ${state.pairs.find((pair) => pair.id === match.winnerId)?.name || 'Pendiente'}` : 'Ganador avanza a la siguiente fase'}
                    </div>
                  </div>
                `,
              )
              .join('')}
          </div>
        </article>
      `,
    )
    .join('') +
    `
      <article class="bracket-champion">
        <div class="bracket-champion-label">Campeón</div>
        <div class="bracket-champion-name">${champion}</div>
        <div class="bracket-champion-meta">
          ${isTournamentFinalized() ? 'Torneo cerrado y archivado' : 'Pendiente de declaración'}
        </div>
      </article>
    `;
};

const renderBracketResults = () => {
  const state = getState();
  const locked = isTournamentFinalized();
  const bracket = state.bracket.length ? state.bracket : buildKnockoutBracket(buildStandings(state.pairs, state.matches), state.pairs, 8);
  const resolvedBracket = resolveBracketWinner(bracket, state.bracketResults || [], state.pairs);
  const flatBracket = flattenBracket(resolvedBracket.played);

  if (flatBracket.length === 0) {
    bracketResultsList.innerHTML = '<div class="placeholder">Todavia no hay resultados del cuadro.</div>';
    return;
  }

  bracketResultsList.innerHTML = flatBracket
    .map(
      (match) => `
        <article class="bracket-result">
          <div class="bracket-result-head">
            <div class="bracket-result-round">${match.roundName}</div>
            <div class="bracket-state">${match.played ? 'Jugado' : 'Pendiente'}</div>
          </div>
          <div class="bracket-result-team">
            <strong>${match.pairALabel}</strong>
            <strong>${match.pairBLabel}</strong>
          </div>
          <label>
            Ganador
            <select data-bracket-match-id="${match.id}" ${match.ready && !locked ? '' : 'disabled'}>
              <option value="">Seleccionar</option>
              <option value="${match.pairAId}" ${(state.bracketResults || []).find((result) => result.matchId === match.id)?.winnerId === match.pairAId ? 'selected' : ''}>${match.pairALabel}</option>
              <option value="${match.pairBId}" ${(state.bracketResults || []).find((result) => result.matchId === match.id)?.winnerId === match.pairBId ? 'selected' : ''}>${match.pairBLabel}</option>
            </select>
          </label>
        </article>
      `,
    )
    .join('');
};

const renderResults = () => {
  const state = getState();
  const locked = isTournamentFinalized();

  if (state.matches.length === 0) {
    resultsList.innerHTML = '<div class="placeholder">Todavia no hay partidos generados.</div>';
    return;
  }

  resultsList.innerHTML = state.matches
    .map(
      (match, index) => `
        <article class="result-block">
          <div class="match-title">Partido ${index + 1}</div>
          <div class="match-meta">${match.pairALabel} vs ${match.pairBLabel}</div>
          <form class="result-form" data-match-id="${match.id}">
            <div class="result-grid">
              <label>
                Ganador
                <select name="winnerId" ${locked ? 'disabled' : ''}>
                  <option value="">Definir por score</option>
                  <option value="${match.pairAId}" ${match.winnerId === match.pairAId ? 'selected' : ''}>${match.pairALabel}</option>
                  <option value="${match.pairBId}" ${match.winnerId === match.pairBId ? 'selected' : ''}>${match.pairBLabel}</option>
                </select>
              </label>
              <label>
                Sets ${match.pairALabel}
                <input name="setsA" type="number" min="0" value="${match.setsA ?? ''}" ${locked ? 'disabled' : ''} />
              </label>
              <label>
                Sets ${match.pairBLabel}
                <input name="setsB" type="number" min="0" value="${match.setsB ?? ''}" ${locked ? 'disabled' : ''} />
              </label>
              <label>
                Games ${match.pairALabel}
                <input name="gamesA" type="number" min="0" value="${match.gamesA ?? ''}" ${locked ? 'disabled' : ''} />
              </label>
              <label>
                Games ${match.pairBLabel}
                <input name="gamesB" type="number" min="0" value="${match.gamesB ?? ''}" ${locked ? 'disabled' : ''} />
              </label>
              <label>
                Día
                <input name="date" type="date" value="${match.date || ''}" ${locked ? 'disabled' : ''} />
              </label>
              <label>
                Hora
                <input name="time" type="time" value="${match.time || ''}" ${locked ? 'disabled' : ''} />
              </label>
              <label>
                Lugar
                <input name="venue" type="text" value="${match.venue || ''}" placeholder="Sede o cancha" ${locked ? 'disabled' : ''} />
              </label>
            </div>
            <div class="result-actions">
              <button type="button" class="secondary" data-action="noshow-a" data-match-id="${match.id}" ${locked ? 'disabled' : ''}>No show A</button>
              <button type="button" class="secondary" data-action="noshow-b" data-match-id="${match.id}" ${locked ? 'disabled' : ''}>No show B</button>
              <button type="submit" class="primary" ${locked ? 'disabled' : ''}>Guardar</button>
            </div>
          </form>
        </article>
      `,
    )
    .join('');
};

const renderHistory = () => {
  const state = getState();
  const dateFilter = historyDateFilter.value.trim();
  const playerFilter = normalizeText(historyPlayerFilter.value || '').toLowerCase();

  const records = [...(state.history || [])]
    .sort((left, right) => new Date(right.archivedAt) - new Date(left.archivedAt))
    .filter((record) => {
      const matchesDate = !dateFilter || record.archivedAt.slice(0, 10) === dateFilter;
      if (!matchesDate) {
        return false;
      }

      if (!playerFilter) {
        return true;
      }

      const searchBlob = [
        record.tournamentName,
        ...(record.pairs || []).flatMap((pair) => [pair.name, pair.playerOne, pair.playerTwo]),
      ]
        .join(' ')
        .toLowerCase();

      return searchBlob.includes(playerFilter);
    });

  if (records.length === 0) {
    historyList.innerHTML = '<div class="placeholder">No hay torneos archivados para ese filtro.</div>';
    return;
  }

  historyList.innerHTML = records
    .map((record) => {
      const topNames = (record.standings || [])
        .slice(0, 3)
        .map((row) => row.name)
        .join(' · ');

      return `
        <article class="history-item">
          <div class="history-title">${record.tournamentName}</div>
          <div class="history-meta">
            Archivado: ${new Date(record.archivedAt).toLocaleDateString('es-AR')} · ${record.status} · ${record.pairs.length} parejas
          </div>
          <div class="history-meta">
            Torneo: ${record.tournamentDate ? new Date(`${record.tournamentDate}T00:00:00`).toLocaleDateString('es-AR') : 'Sin fecha'} · ${formatTournamentMode(record.tournamentMode)} · ${record.tournamentPlace || 'Sin lugar'}
          </div>
          <div class="history-meta">Campeón: ${record.winnerName || 'Sin definir'}</div>
          <div class="history-meta">Top: ${topNames || 'Sin tabla'}</div>
        </article>
      `;
    })
    .join('');
};

const renderAll = () => {
  renderRules();
  renderTournamentInfo();
  renderPlayerOptions();
  renderPlayers();
  renderPairs();
  renderWinnerSelect();
  renderGroups();
  renderMatches();
  renderStandings();
  renderPodium();
  renderBracket();
  renderBracketResults();
  renderResults();
  renderHistory();
  renderAdminState();
};

const renderAdminState = () => {
  const unlocked = isAdminUnlocked();
  const locked = isTournamentFinalized();
  const hasTournament = hasActiveTournament(getState());
  adminLock.hidden = unlocked;
  adminLock.classList.toggle('is-hidden', unlocked);
  adminContent.hidden = !unlocked;
  adminContent.classList.toggle('is-hidden', !unlocked);

  [
    pairId,
    pairName,
    clearPairs,
    planTournament,
    loadSamplePairs,
    tournamentWinner,
  ].forEach((control) => {
    if (!control) {
      return;
    }

    control.disabled = !unlocked || (locked && control !== adminLogout);
  });

  pairForm.querySelectorAll('input, button').forEach((control) => {
    control.disabled = !unlocked || locked;
  });

  if (adminLogout) {
    adminLogout.disabled = !unlocked;
  }

  if (archiveTournament) {
    archiveTournament.disabled = !unlocked || !canArchiveTournament();
  }

  if (pairForm) {
    pairForm.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = !unlocked || locked || !hasTournament;
    });
  }

  if (playerForm) {
    playerForm.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = !unlocked;
    });
  }

  if (tournamentForm) {
    tournamentForm.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = !unlocked || hasTournament;
    });
  }

  if (deleteCurrentTournament) {
    deleteCurrentTournament.disabled = !unlocked || locked || !hasTournament;
  }
};

const setActiveTab = (tabName) => {
  tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tabName);
  });

  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === `tab-${tabName}`);
  });
};

const resetForm = () => {
  pairForm.reset();
  pairId.value = '';
  planTournament.textContent = 'Planificar automáticamente';
};

const resetPlayerForm = () => {
  playerForm.reset();
  playerId.value = '';
};

const startEditPair = (id) => {
  const state = getState();
  const pair = state.pairs.find((entry) => entry.id === id);
  if (!pair) {
    return;
  }

  pairId.value = pair.id;
  pairName.value = pair.name;
  playerOneSelect.value = pair.playerOneId || '';
  playerTwoSelect.value = pair.playerTwoId || '';
  planTournament.textContent = 'Planificar automáticamente';
  setActiveTab('admin');
};

const startEditPlayer = (id) => {
  const state = getState();
  const player = state.players.find((entry) => entry.id === id);
  if (!player) {
    return;
  }

  playerId.value = player.id;
  playerFirstName.value = player.firstName || '';
  playerLastName.value = player.lastName || '';
  playerAlias.value = player.nickname || '';
  setActiveTab('admin');
};

const deletePair = (id) => {
  const state = getState();
  const nextPairs = state.pairs.filter((entry) => entry.id !== id);
  setState({
    ...state,
    pairs: nextPairs,
  });
};

const deletePlayer = (id) => {
  const state = getState();
  const usedInPairs = state.pairs.some((pair) => pair.playerOneId === id || pair.playerTwoId === id);

  if (usedInPairs) {
    alert('No se puede borrar un jugador que ya está usado en una pareja.');
    return;
  }

  setState({
    ...state,
    players: state.players.filter((player) => player.id !== id),
  });
};

const createNewTournament = ({ date, mode, place }) => {
  const state = getState();

  if (hasActiveTournament(state)) {
    alert('Primero completá o eliminá el torneo actual.');
    return;
  }

  setState({
    ...state,
    tournament: {
      ...defaultState().tournament,
      name: 'Torneo de padel',
      date,
      mode,
      place,
      createdAt: new Date().toISOString(),
      status: 'Torneo activo',
    },
    pairs: [],
    groups: [],
    matches: [],
    standings: [],
    bracket: [],
    bracketResults: [],
    bracketChampion: null,
  });
};

const deleteCurrentTournamentState = () => {
  const state = getState();

  setState({
    ...state,
    tournament: {
      ...defaultState().tournament,
    },
    pairs: [],
    groups: [],
    matches: [],
    standings: [],
    bracket: [],
    bracketResults: [],
    bracketChampion: null,
  });
};

const updateMatch = (matchId, updater) => {
  if (!canEditTournament()) {
    return;
  }

  const state = getState();
  const nextMatches = state.matches.map((match) => {
    if (match.id !== matchId) {
      return match;
    }

    return updater(match);
  });

  setState({
    ...state,
    matches: nextMatches,
    tournament: {
      ...state.tournament,
      status: 'Resultados actualizados',
    },
  });
};

const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isNaN(parsedValue) ? null : parsedValue;
};

const applyNoShow = (matchId, winnerSide) => {
  if (!canEditTournament()) {
    return;
  }

  updateMatch(matchId, (match) => {
    const winnerId = winnerSide === 'A' ? match.pairAId : match.pairBId;
    const loserId = winnerSide === 'A' ? match.pairBId : match.pairAId;

    return {
      ...match,
      played: true,
      winnerId,
      loserId,
      setsA: winnerSide === 'A' ? 2 : 0,
      setsB: winnerSide === 'A' ? 0 : 2,
      gamesA: winnerSide === 'A' ? 12 : 0,
      gamesB: winnerSide === 'A' ? 0 : 12,
    };
  });
};

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

adminLoginForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const password = adminPassword.value.trim();
  if (!password) {
    return;
  }

  const unlocked = unlockAdmin(password);
  adminPassword.value = '';

  if (!unlocked) {
    alert('Contraseña incorrecta.');
    return;
  }

  adminLock.hidden = true;
  adminLock.classList.add('is-hidden');
  adminContent.hidden = false;
  adminContent.classList.remove('is-hidden');
  renderAll();
  setActiveTab('admin');
});

pairForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!canEditTournament()) {
    alert('Acceso denegado.');
    return;
  }

  const state = getState();
  if (!hasActiveTournament(state)) {
    alert('Creá un torneo antes de agregar parejas.');
    return;
  }

  const name = normalizeText(pairName.value);
  const firstPlayerId = playerOneSelect.value.trim();
  const secondPlayerId = playerTwoSelect.value.trim();
  const editingId = pairId.value.trim();

  if (!name || !firstPlayerId || !secondPlayerId) {
    alert('Completa nombre de pareja y seleccioná dos jugadores.');
    return;
  }

  if (firstPlayerId === secondPlayerId) {
    alert('Una pareja no puede usar el mismo jugador dos veces.');
    return;
  }

  const players = state.players || [];
  const firstPlayer = getPlayerName(players, firstPlayerId);
  const secondPlayer = getPlayerName(players, secondPlayerId);

  if (!firstPlayer || !secondPlayer) {
    alert('Seleccioná jugadores válidos.');
    return;
  }

  const nextPair = {
    id: editingId || createId(),
    name,
    playerOneId: firstPlayerId,
    playerTwoId: secondPlayerId,
    playerOne: firstPlayer,
    playerTwo: secondPlayer,
    createdAt: editingId
      ? state.pairs.find((entry) => entry.id === editingId)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const nextPairs = editingId
    ? state.pairs.map((entry) => (entry.id === editingId ? nextPair : entry))
    : [nextPair, ...state.pairs];

  setState({
    ...state,
    pairs: nextPairs,
  });

  resetForm();
  setActiveTab('parejas');
});

playerForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!isAdminUnlocked()) {
    alert('Acceso denegado.');
    return;
  }

  const state = getState();
  const firstName = normalizeText(playerFirstName.value);
  const lastName = normalizeText(playerLastName.value);
  const alias = normalizeText(playerAlias.value || '');
  const editingId = playerId.value.trim();

  if (!firstName || !lastName) {
    return;
  }

  const duplicatePlayer = state.players.find(
    (player) =>
      normalizeText(player.firstName).toLowerCase() === firstName.toLowerCase() &&
      normalizeText(player.lastName).toLowerCase() === lastName.toLowerCase() &&
      player.id !== editingId,
  );

  if (duplicatePlayer) {
    alert('Ya existe un jugador con ese nombre.');
    return;
  }

  const nextPlayer = {
    id: editingId || createId(),
    firstName,
    lastName,
    nickname: alias,
    fullName: [firstName, lastName].join(' ').trim(),
    createdAt: editingId ? state.players.find((player) => player.id === editingId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const nextPlayers = editingId
    ? state.players.map((player) => (player.id === editingId ? nextPlayer : player))
    : [...state.players, nextPlayer];

  setState({
    ...state,
    players: nextPlayers,
  });

  resetPlayerForm();
});

playersList.addEventListener('click', (event) => {
  if (!isAdminUnlocked()) {
    return;
  }

  const button = event.target.closest('button[data-player-action]');
  if (!button) {
    return;
  }

  const { playerAction, playerId: targetPlayerId } = button.dataset;

  if (playerAction === 'edit') {
    startEditPlayer(targetPlayerId);
  }

  if (playerAction === 'delete') {
    deletePlayer(targetPlayerId);
    if (playerId.value === targetPlayerId) {
      resetPlayerForm();
    }
  }
});

tournamentForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!isAdminUnlocked()) {
    return;
  }

  createNewTournament({
    date: tournamentDate.value,
    mode: tournamentMode.value,
    place: normalizeText(tournamentPlace.value),
  });
});

deleteCurrentTournament.addEventListener('click', () => {
  if (!isAdminUnlocked()) {
    return;
  }

  if (!hasActiveTournament(getState())) {
    return;
  }

  deleteCurrentTournamentState();
  resetForm();
  resetPlayerForm();
});

pairsList.addEventListener('click', (event) => {
  if (!canEditTournament()) {
    if (isAdminUnlocked()) {
      alert('El torneo está cerrado.');
    }
    return;
  }

  const state = getState();
  if (!hasActiveTournament(state)) {
    return;
  }

  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const { action, id } = button.dataset;

  if (action === 'edit') {
    startEditPair(id);
  }

  if (action === 'delete') {
    deletePair(id);
    if (pairId.value === id) {
      resetForm();
    }
  }
});

resultsList.addEventListener('click', (event) => {
  if (!canEditTournament()) {
    return;
  }

  const state = getState();
  if (!hasActiveTournament(state)) {
    return;
  }

  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const { action, matchId } = button.dataset;

  if (action === 'noshow-a') {
    applyNoShow(matchId, 'A');
  }

  if (action === 'noshow-b') {
    applyNoShow(matchId, 'B');
  }
});

resultsList.addEventListener('submit', (event) => {
  if (!canEditTournament()) {
    return;
  }

  const form = event.target.closest('form[data-match-id]');
  if (!form || event.target !== form) {
    return;
  }

  event.preventDefault();

  const state = getState();
  if (!hasActiveTournament(state)) {
    return;
  }

  const matchId = form.dataset.matchId;
  const formData = new FormData(form);
  const match = state.matches.find((entry) => entry.id === matchId);
  const winnerId = formData.get('winnerId');
  const setsA = parseNumber(formData.get('setsA'));
  const setsB = parseNumber(formData.get('setsB'));
  const gamesA = parseNumber(formData.get('gamesA'));
  const gamesB = parseNumber(formData.get('gamesB'));
  const date = normalizeText(formData.get('date') || '');
  const time = normalizeText(formData.get('time') || '');
  const venue = normalizeText(formData.get('venue') || '');

  if (setsA === null || setsB === null || gamesA === null || gamesB === null) {
    alert('Completa sets y games para guardar el resultado.');
    return;
  }

  if (!match) {
    alert('No se encontró el partido.');
    return;
  }

  const scoreWinnerId = getMatchWinnerFromScore(match, setsA, setsB, gamesA, gamesB);
  let resolvedWinnerId = winnerId || null;

  if (!resolvedWinnerId) {
    resolvedWinnerId = scoreWinnerId;
  }

  if (!resolvedWinnerId) {
    alert('El score no define ganador. Ajustá sets o games, o elegí el ganador manualmente.');
    return;
  }

  if (winnerId && scoreWinnerId && winnerId !== scoreWinnerId) {
    alert('El ganador seleccionado no coincide con el score.');
    return;
  }

  if (winnerId && !scoreWinnerId && (setsA === setsB || gamesA === gamesB)) {
    alert('El score está empatado o no es decisivo. No puede guardarse así.');
    return;
  }

  updateMatch(matchId, (match) => ({
    ...match,
    played: true,
    winnerId: resolvedWinnerId,
    loserId: resolvedWinnerId === match.pairAId ? match.pairBId : match.pairAId,
    setsA,
    setsB,
    gamesA,
    gamesB,
    date,
    time,
    venue,
  }));
});

bracketResultsList.addEventListener('change', (event) => {
  if (!canEditTournament()) {
    return;
  }

  const select = event.target.closest('select[data-bracket-match-id]');
  if (!select) {
    return;
  }

  const state = getState();
  if (!hasActiveTournament(state)) {
    return;
  }

  const matchId = select.dataset.bracketMatchId;
  const winnerId = select.value.trim();
  const nextBracketResults = (state.bracketResults || []).filter((result) => result.matchId !== matchId);

  if (winnerId) {
    nextBracketResults.push({ matchId, winnerId });
  }

  const nextState = {
    ...state,
    bracketResults: nextBracketResults,
  };
  const nextDerived = rebuildDerivedState(nextState);

  setState({
    ...nextDerived,
    tournament: {
      ...nextDerived.tournament,
      winnerId: nextDerived.bracketChampion?.winnerId || nextDerived.tournament.winnerId || null,
      closedAt: nextDerived.bracketChampion?.winnerId ? nextDerived.tournament.closedAt : null,
      status: nextDerived.bracketChampion?.winnerId ? 'Campeón definido' : 'Resultados del cuadro actualizados',
    },
  });
});

clearPairs.addEventListener('click', () => {
  if (!isAdminUnlocked() || isTournamentFinalized()) {
    return;
  }

  const state = getState();
  if (!hasActiveTournament(state)) {
    return;
  }

  setState({
    ...state,
    pairs: [],
    groups: [],
    matches: [],
    standings: [],
    bracket: [],
    bracketResults: [],
    bracketChampion: null,
    tournament: {
      ...state.tournament,
      winnerId: null,
      closedAt: null,
      status: state.tournament.createdAt ? 'Torneo activo' : 'Sin torneo activo',
    },
  });
  resetForm();
});

loadSamplePairs.addEventListener('click', () => {
  if (!isAdminUnlocked() || isTournamentFinalized()) {
    alert('Acceso denegado.');
    return;
  }

  const state = getState();
  if (!hasActiveTournament(state)) {
    alert('Creá un torneo antes de cargar parejas.');
    return;
  }

  const playerMap = new Map((state.players || []).map((player) => [normalizeText(player.fullName).toLowerCase(), player]));
  const nextPlayers = [...(state.players || [])];

  const ensurePlayer = (fullName) => {
    const cleanName = normalizeText(fullName);
    const key = cleanName.toLowerCase();
    if (playerMap.has(key)) {
      return playerMap.get(key);
    }

    const newPlayer = {
      id: createId(),
      firstName: cleanName.split(' ')[0] || cleanName,
      lastName: cleanName.split(' ').slice(1).join(' '),
      nickname: '',
      fullName: cleanName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    nextPlayers.push(newPlayer);
    playerMap.set(key, newPlayer);
    return newPlayer;
  };

  const nextPairs = samplePairs.map(([name, playerOneName, playerTwoName]) => {
    const firstPlayer = ensurePlayer(playerOneName);
    const secondPlayer = ensurePlayer(playerTwoName);

    return {
      id: createId(),
      name,
      playerOneId: firstPlayer.id,
      playerTwoId: secondPlayer.id,
      playerOne: getPlayerDisplayName(firstPlayer) || firstPlayer.fullName,
      playerTwo: getPlayerDisplayName(secondPlayer) || secondPlayer.fullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  setState({
    ...state,
    players: nextPlayers,
    pairs: nextPairs,
    tournament: {
      ...state.tournament,
      status: 'Parejas de prueba cargadas',
      winnerId: null,
      closedAt: null,
    },
    groups: [],
    matches: [],
    standings: [],
    bracket: [],
    bracketResults: [],
    bracketChampion: null,
  });

  setActiveTab('parejas');
});

planTournament.addEventListener('click', () => {
  if (!isAdminUnlocked() || isTournamentFinalized()) {
    alert('Acceso denegado.');
    return;
  }

  const state = getState();
  if (!hasActiveTournament(state)) {
    alert('Creá un torneo antes de planificar.');
    return;
  }

  const pairTotal = state.pairs.length;

  if (pairTotal < 2) {
    alert('Necesitas al menos 2 parejas para planificar el torneo.');
    return;
  }

  const groupCount = pairTotal >= 13 ? 4 : pairTotal >= 9 ? 3 : pairTotal >= 5 ? 2 : 1;
  const groups = buildBalancedGroups(state.pairs, groupCount);
  const matches = buildBalancedCrossGroupFixtures(state.pairs, groups, 2);

  setState({
    ...state,
    tournament: {
      ...state.tournament,
      status: 'Torneo planificado',
      winnerId: null,
      closedAt: null,
    },
    groups,
    matches,
    standings: buildStandings(state.pairs, matches),
    bracketResults: [],
    bracketChampion: null,
  });

  setActiveTab('torneo');
});

archiveTournament.addEventListener('click', () => {
  if (!canEditTournament()) {
    alert('Acceso denegado.');
    return;
  }

  const state = getState();
  const winnerId = state.bracketChampion?.winnerId || null;

  if (!winnerId) {
    alert('Primero resolvé el cuadro completo para definir al campeón.');
    return;
  }

  if (state.tournament.closedAt || state.tournament.status === 'Archivado') {
    alert('El torneo ya está cerrado.');
    return;
  }

  const snapshot = buildHistorySnapshot(state);
  const nextHistory = [snapshot, ...(state.history || [])];
  const nextBaseState = defaultState();

  setState({
    ...nextBaseState,
    players: state.players,
    history: nextHistory,
    tournament: {
      ...nextBaseState.tournament,
      status: 'Torneo archivado',
      winnerId,
      closedAt: new Date().toISOString(),
    },
  });

  setActiveTab('historial');
});

historyDateFilter.addEventListener('input', renderAll);
historyPlayerFilter.addEventListener('input', renderAll);
fixtureStatusFilter.addEventListener('change', renderAll);
fixturePlayerFilter.addEventListener('input', renderAll);
tournamentWinner.addEventListener('change', () => {
  if (!canEditTournament()) {
    return;
  }

  const state = getState();
  setState({
    ...state,
    tournament: {
      ...state.tournament,
      winnerId: tournamentWinner.value.trim() || null,
      closedAt: null,
    },
  });
});

adminLogout.addEventListener('click', () => {
  lockAdmin();
  adminLock.hidden = false;
  adminLock.classList.remove('is-hidden');
  adminContent.hidden = true;
  adminContent.classList.add('is-hidden');
  renderAll();
  setActiveTab('admin');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isAdminUnlocked()) {
    lockAdmin();
    adminLock.hidden = false;
    adminLock.classList.remove('is-hidden');
    adminContent.hidden = true;
    adminContent.classList.add('is-hidden');
    renderAll();
    setActiveTab('admin');
  }
});

renderAll();
setActiveTab('torneo');
