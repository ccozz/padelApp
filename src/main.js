import { defaultState, rules } from './constants.js';
import { forceLockAdmin, isAdminUnlocked, lockAdmin, syncAdminSession, unlockAdmin } from './auth.js';
import {
  archiveCategory,
  createCategory,
  createEvent,
  createPair,
  createPlayer,
  deleteEvent,
  deletePair,
  deletePlayer,
  loadState,
  normalizeText,
  planCategory,
  updateMatch,
  updatePair,
  updatePlayer,
} from './storage.js';

const tabButtons = document.querySelectorAll('[data-tab]');
const panels = document.querySelectorAll('.panel');

const eventNameDesktop = document.getElementById('eventName');
const eventNameMobile = document.getElementById('eventNameMobile');
const eventSubtitleDesktop = document.getElementById('eventSubtitle');
const eventSubtitleMobile = document.getElementById('eventSubtitleMobile');
const eventStatus = document.getElementById('eventStatus');
const eventMeta = document.getElementById('eventMeta');
const categoryRail = document.getElementById('categoryRail');
const overviewList = document.getElementById('overviewList');
const fixtureCategoryTitle = document.getElementById('fixtureCategoryTitle');
const fixtureCategoryMeta = document.getElementById('fixtureCategoryMeta');
const fixtureList = document.getElementById('fixtureList');
const tableCategoryTitle = document.getElementById('tableCategoryTitle');
const tableCategoryMeta = document.getElementById('tableCategoryMeta');
const groupsList = document.getElementById('groupsList');
const standingsList = document.getElementById('standingsList');
const bracketList = document.getElementById('bracketList');
const bracketResultsList = document.getElementById('bracketResultsList');
const rulesList = document.getElementById('rulesList');
const pairsList = document.getElementById('pairsList');
const historyRoot = document.getElementById('historyRoot');
const appError = document.getElementById('appError');
const adminLock = document.getElementById('adminLock');
const adminContent = document.getElementById('adminContent');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminUsername = document.getElementById('adminUsername');
const adminPassword = document.getElementById('adminPassword');
const adminLoginError = document.getElementById('adminLoginError');
const adminLogout = document.getElementById('adminLogout');
const themeToggle = document.getElementById('themeToggle');
const themeToggleMobile = document.getElementById('themeToggleMobile');
const eventForm = document.getElementById('eventForm');
const eventNameInput = document.getElementById('eventNameInput');
const eventDateInput = document.getElementById('eventDateInput');
const eventModeInput = document.getElementById('eventModeInput');
const eventPlaceInput = document.getElementById('eventPlaceInput');
const eventCategoryNameInput = document.getElementById('eventCategoryNameInput');
const eventMaxPairsInput = document.getElementById('eventMaxPairsInput');
const deleteEventButton = document.getElementById('deleteEventButton');
const categoryForm = document.getElementById('categoryForm');
const categoryNameInput = document.getElementById('categoryNameInput');
const categoryMaxPairsInput = document.getElementById('categoryMaxPairsInput');
const categorySelect = document.getElementById('categorySelect');
const adminCategorySelect = document.getElementById('adminCategorySelect');
const pairCategorySelect = document.getElementById('pairCategorySelect');
const categoryWinnerSelect = document.getElementById('categoryWinnerSelect');
const currentEventSummary = document.getElementById('currentEventSummary');
const playerForm = document.getElementById('playerForm');
const playerId = document.getElementById('playerId');
const playerFirstName = document.getElementById('playerFirstName');
const playerLastName = document.getElementById('playerLastName');
const playerAlias = document.getElementById('playerAlias');
const pairForm = document.getElementById('pairForm');
const pairId = document.getElementById('pairId');
const pairName = document.getElementById('pairName');
const playerOneSelect = document.getElementById('playerOneSelect');
const playerTwoSelect = document.getElementById('playerTwoSelect');
const planCategoryButton = document.getElementById('planCategory');
const archiveCategoryButton = document.getElementById('archiveCategory');
const loadSamplePairsButton = document.getElementById('loadSamplePairs');
const clearPairsButton = document.getElementById('clearPairs');
const openPlayersModal = document.getElementById('openPlayersModal');
const openPairsTab = document.getElementById('openPairsTab');
const playersModal = document.getElementById('playersModal');
const playersList = document.getElementById('playersList');
const closePlayersModal = document.getElementById('closePlayersModal');
const matchEditorList = document.getElementById('matchEditorList');

let appState = defaultState();
let activeTab = 'inicio';
let selectedCategoryId = null;
let themeMode = localStorage.getItem('padelApp.theme') || '';

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toTrimmedString = (value) => String(value ?? '').trim();

const setAppError = (message = '') => {
  if (!appError) {
    return;
  }

  if (!message) {
    appError.hidden = true;
    appError.textContent = '';
    return;
  }

  appError.hidden = false;
  appError.textContent = message;
};

const setAdminLoginError = (message = '') => {
  if (!adminLoginError) {
    return;
  }

  if (!message) {
    adminLoginError.hidden = true;
    adminLoginError.textContent = '';
    return;
  }

  adminLoginError.hidden = false;
  adminLoginError.textContent = message;
};

const formErrorMap = new Map();

const ensureFormErrorNode = (form, key) => {
  if (!form) {
    return null;
  }

  if (formErrorMap.has(key)) {
    const existingNode = formErrorMap.get(key);
    if (existingNode?.isConnected) {
      return existingNode;
    }
    formErrorMap.delete(key);
  }

  const node = document.createElement('div');
  node.dataset.formError = key;
  node.setAttribute('role', 'alert');
  node.style.marginTop = '0.75rem';
  node.style.padding = '0.75rem 1rem';
  node.style.border = '2px solid var(--color-danger)';
  node.style.borderRadius = '0.9rem';
  node.style.background = 'color-mix(in srgb, var(--color-danger) 16%, var(--color-surface))';
  node.style.color = 'var(--color-text-primary)';
  node.style.fontWeight = '600';
  node.hidden = true;

  form.insertAdjacentElement('afterend', node);
  formErrorMap.set(key, node);
  return node;
};

const setFormError = (form, key, message = '') => {
  const node = ensureFormErrorNode(form, key);
  if (!node) {
    return;
  }

  if (!message) {
    node.hidden = true;
    node.textContent = '';
    return;
  }

  node.hidden = false;
  node.textContent = message;
};

const clearFormError = (form, key) => setFormError(form, key, '');

const buildPlayerOptionMarkup = (player, selectedId, excludedId = '') => {
  if (!player || player.id === excludedId) {
    return '';
  }

  return `<option value="${escapeHtml(player.id)}" ${player.id === selectedId ? 'selected' : ''}>${escapeHtml(getPlayerLabel(player))}</option>`;
};

const syncPairPlayerSelects = (changedSelect) => {
  if (!playerOneSelect || !playerTwoSelect) {
    return;
  }

  const selectedOne = playerOneSelect.value || '';
  const selectedTwo = playerTwoSelect.value || '';

  if (changedSelect === playerOneSelect && selectedOne && selectedOne === selectedTwo) {
    playerTwoSelect.value = '';
  }

  if (changedSelect === playerTwoSelect && selectedTwo && selectedTwo === selectedOne) {
    playerOneSelect.value = '';
  }

  const nextSelectedOne = playerOneSelect.value || '';
  const nextSelectedTwo = playerTwoSelect.value || '';
  const players = appState.players || [];

  playerOneSelect.innerHTML = players
    .map((player) => buildPlayerOptionMarkup(player, nextSelectedOne, nextSelectedTwo))
    .join('');
  playerTwoSelect.innerHTML = players
    .map((player) => buildPlayerOptionMarkup(player, nextSelectedTwo, nextSelectedOne))
    .join('');
};

const setBusy = (container, busy) => {
  if (!container) {
    return;
  }

  container.querySelectorAll('button, input, select, textarea').forEach((control) => {
    if (control.id === 'adminLogout' && !busy) {
      return;
    }

    control.disabled = busy;
  });
};

const setTheme = (nextTheme) => {
  themeMode = nextTheme || '';

  if (themeMode) {
    document.body.dataset.theme = themeMode;
    localStorage.setItem('padelApp.theme', themeMode);
  } else {
    delete document.body.dataset.theme;
    localStorage.removeItem('padelApp.theme');
  }

  const label = themeMode ? `Tema: ${themeMode}` : 'Tema sistema';
  if (themeToggle) {
    themeToggle.textContent = label;
  }
  if (themeToggleMobile) {
    themeToggleMobile.textContent = label;
  }
};

const toggleTheme = () => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (!themeMode) {
    setTheme(prefersDark ? 'light' : 'dark');
    return;
  }

  setTheme(themeMode === 'dark' ? 'light' : 'dark');
};

const formatDateLabel = (dateValue) => {
  if (!dateValue) {
    return 'Sin fecha';
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return toTrimmedString(dateValue);
  }

  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const formatDateTimeLabel = (dateValue, timeValue) => {
  const dateLabel = formatDateLabel(dateValue);
  return timeValue ? `${dateLabel} · ${timeValue}` : dateLabel;
};

const getPlayerLabel = (player) => {
  if (!player) {
    return 'Jugador';
  }

  return player.nickname ? player.nickname : player.fullName || [player.firstName, player.lastName].filter(Boolean).join(' ');
};

const getPairLabel = (pair) => {
  if (!pair) {
    return 'Pareja';
  }

  return pair.name || [getPlayerLabel(pair.playerOne), getPlayerLabel(pair.playerTwo)].filter(Boolean).join(' / ');
};

const getSelectedCategory = () =>
  appState.categories.find((category) => category.id === selectedCategoryId) ||
  appState.selectedCategory ||
  appState.categories[0] ||
  null;

const normalizeLoadedState = (loadedState) => {
  const categories = Array.isArray(loadedState.categories) ? loadedState.categories : [];
  const preservedCategoryId = selectedCategoryId && categories.some((category) => category.id === selectedCategoryId) ? selectedCategoryId : null;
  const nextSelectedCategoryId = preservedCategoryId || loadedState.selectedCategoryId || categories.find((category) => category.status !== 'Torneo archivado')?.id || categories[0]?.id || null;
  const selectedCategory = categories.find((category) => category.id === nextSelectedCategoryId) || null;

  return {
    ...loadedState,
    categories,
    selectedCategoryId: nextSelectedCategoryId,
    selectedCategory,
    pairs: selectedCategory?.pairs || [],
    groups: selectedCategory?.groups || [],
    matches: selectedCategory?.matches || [],
    standings: selectedCategory?.standings || [],
    bracket: selectedCategory?.bracket || [],
    bracketResults: selectedCategory?.bracketResults || [],
    bracketChampion: selectedCategory?.bracketChampion || null,
  };
};

const reloadState = async () => {
  const loadedState = await loadState();
  appState = normalizeLoadedState(loadedState);
};

const setSelectedCategoryId = (categoryId) => {
  if (!categoryId || !appState.categories.some((category) => category.id === categoryId)) {
    return;
  }

  selectedCategoryId = categoryId;
  appState = normalizeLoadedState(appState);
  renderAll();
};

const setActiveTab = (tabName) => {
  activeTab = tabName;
  tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tabName);
  });

  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === `tab-${tabName}`);
  });
};

const renderTabs = () => {
  tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === activeTab);
  });

  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === `tab-${activeTab}`);
  });
};

const renderEventHeader = () => {
  const event = appState.event || defaultState().event;
  const categoryCount = appState.categories.length;
  const activeCategory = getSelectedCategory();

  const eventTitle = event.name || 'padelApp';
  const subtitle = categoryCount
    ? `${categoryCount} categoría${categoryCount === 1 ? '' : 's'} · ${event.mode || 'sin modo'} · ${event.place || 'sin sede'}`
    : 'Sin evento activo';

  [eventNameDesktop, eventNameMobile].forEach((node) => {
    if (node) {
      node.textContent = eventTitle;
    }
  });

  [eventSubtitleDesktop, eventSubtitleMobile].forEach((node) => {
    if (node) {
      node.textContent = categoryCount
        ? 'Vista pública + panel admin'
        : 'Creá un evento desde el panel de admin.';
    }
  });

  if (eventStatus) {
    eventStatus.textContent = event.status || 'Sin evento activo';
  }

  if (eventMeta) {
    eventMeta.textContent = categoryCount
      ? `${formatDateLabel(event.date)} · ${event.place || 'Sin sede'}`
      : 'Creá un evento desde el panel de admin.';
  }

  if (fixtureCategoryTitle) {
    fixtureCategoryTitle.textContent = activeCategory ? activeCategory.name : 'Sin categoría seleccionada';
  }

  if (fixtureCategoryMeta) {
    fixtureCategoryMeta.textContent = activeCategory
      ? `${activeCategory.status} · ${activeCategory.pairs.length} parejas`
      : 'Elegí una categoría para ver su fixture.';
  }

  if (tableCategoryTitle) {
    tableCategoryTitle.textContent = activeCategory ? activeCategory.name : 'Sin categoría seleccionada';
  }

  if (tableCategoryMeta) {
    tableCategoryMeta.textContent = activeCategory
      ? `${activeCategory.status} · ${activeCategory.pairs.length} parejas`
      : 'Elegí una categoría para ver la tabla.';
  }

  if (currentEventSummary) {
    if (!categoryCount) {
      currentEventSummary.hidden = false;
      currentEventSummary.innerHTML = `
        <strong>${escapeHtml(eventTitle)}</strong>
        <span class="meta">${escapeHtml(event.status || 'Sin evento activo')}</span>
        <span class="meta">${escapeHtml(subtitle)}</span>
      `;
    } else {
      currentEventSummary.hidden = false;
      currentEventSummary.innerHTML = `
        <strong>${escapeHtml(eventTitle)}</strong>
        <span class="meta">${escapeHtml(subtitle)}</span>
      `;
    }
  }
};

const renderCategoryRail = () => {
  if (!categoryRail) {
    return;
  }

  if (!appState.categories.length) {
    categoryRail.innerHTML = '<div class="chip">No hay categorías cargadas</div>';
    return;
  }

  categoryRail.innerHTML = appState.categories
    .map((category) => {
      const isActive = category.id === selectedCategoryId;
      const label = category.maxPairs ? `${category.pairs.length}/${category.maxPairs}` : `${category.pairs.length}`;
      return `
        <button type="button" class="chip ${isActive ? 'is-success' : ''}" data-category-id="${escapeHtml(category.id)}">
          ${escapeHtml(category.name)}
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join('');
};

const renderOverview = () => {
  if (!overviewList) {
    return;
  }

  const event = appState.event || defaultState().event;
  const eventCard = `
    <article class="event-card">
      <header>
        <div>
          <p class="eyebrow">Evento</p>
          <h3>${escapeHtml(event.name || 'Sin evento activo')}</h3>
        </div>
        <span class="chip ${event.status === 'Evento archivado' ? '' : 'is-success'}">${escapeHtml(event.status || 'Sin estado')}</span>
      </header>
      <p class="meta">${escapeHtml(formatDateLabel(event.date))} · ${escapeHtml(event.mode || 'Sin modo')} · ${escapeHtml(event.place || 'Sin sede')}</p>
      <div class="chips">
        <span class="chip">Categorías: ${escapeHtml(appState.categories.length)}</span>
        <span class="chip">Jugadores: ${escapeHtml(appState.players.length)}</span>
      </div>
    </article>
  `;

  const categoryCards = appState.categories.map((category) => {
    const standingTop = category.standings?.slice(0, 3) || [];
    const topLabels = standingTop.length
      ? standingTop.map((row) => escapeHtml(row.name || row.pairLabel || 'Pareja')).join(' · ')
      : 'Sin clasificación todavía';
    const fixturePreview = (category.matches || [])
      .slice(0, 3)
      .map((match) => `${escapeHtml(match.pairALabel)} vs ${escapeHtml(match.pairBLabel)}`)
      .join(' · ') || 'Sin partidos todavía';
    const bracketPreview = (category.bracket || [])
      .flatMap((round) => (round.matches || []).map((match) => `${escapeHtml(round.name)}: ${escapeHtml(match.pairALabel)} vs ${escapeHtml(match.pairBLabel)}`))
      .slice(0, 3)
      .join(' · ') || 'Sin cuadro todavía';
    const capacity = category.maxPairs ? `${category.pairs.length}/${category.maxPairs}` : `${category.pairs.length}`;
    return `
      <article class="category-card">
        <header>
          <div>
            <p class="eyebrow">Categoría</p>
            <h3>${escapeHtml(category.name)}</h3>
          </div>
          <span class="chip ${category.status === 'Torneo archivado' ? '' : 'is-success'}">${escapeHtml(category.status)}</span>
        </header>
        <p class="meta">Parejas ${escapeHtml(capacity)} · ${escapeHtml(category.groups.length)} grupos · ${escapeHtml(category.matches.length)} partidos</p>
        <div class="chips">
          <span class="chip">Top: ${topLabels}</span>
        </div>
        <div class="grid-two">
          <div class="match-card">
            <p class="eyebrow">Tabla</p>
            <p class="meta">${topLabels}</p>
          </div>
          <div class="match-card">
            <p class="eyebrow">Fixture</p>
            <p class="meta">${fixturePreview}</p>
          </div>
          <div class="match-card">
            <p class="eyebrow">Cuadro</p>
            <p class="meta">${bracketPreview}</p>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="secondary" data-category-id="${escapeHtml(category.id)}">Ver categoría</button>
        </div>
      </article>
    `;
  });

  overviewList.innerHTML = [eventCard, ...categoryCards].join('');
};

const renderFixture = () => {
  if (!fixtureList) {
    return;
  }

  const category = getSelectedCategory();
  if (!category) {
    fixtureList.innerHTML = '<div class="card">No hay categoría seleccionada.</div>';
    return;
  }

  const matches = [...(category.matches || [])];
  if (!matches.length) {
    fixtureList.innerHTML = '<div class="card">Todavía no hay partidos generados para esta categoría.</div>';
    return;
  }

  const groupedByDate = matches.reduce((accumulator, match) => {
    const key = match.date || 'Sin fecha';
    if (!accumulator[key]) {
      accumulator[key] = [];
    }

    accumulator[key].push(match);
    return accumulator;
  }, {});

  fixtureList.innerHTML = Object.entries(groupedByDate)
    .map(([dateLabel, dayMatches]) => {
      const cards = dayMatches
        .map((match) => {
          const winnerLabel = match.winnerId === match.pairAId
            ? match.pairALabel
            : match.winnerId === match.pairBId
              ? match.pairBLabel
              : 'Pendiente';

          const adminBlock = isAdminUnlocked()
            ? `
              <details class="fixture-editor">
                <summary class="secondary">Editar día y hora</summary>
                <form class="admin-form" data-match-form="${escapeHtml(match.id)}">
                  <label>
                    Fecha
                    <input name="date" type="date" value="${escapeHtml(match.date || '')}" />
                  </label>
                  <label>
                    Hora
                    <input name="time" type="time" value="${escapeHtml(match.time || '')}" />
                  </label>
                  <label>
                    Sede
                    <input name="venue" type="text" value="${escapeHtml(match.venue || '')}" />
                  </label>
                  <label>
                    Sets A
                    <input name="setsA" type="number" min="0" value="${escapeHtml(match.setsA ?? '')}" />
                  </label>
                  <label>
                    Sets B
                    <input name="setsB" type="number" min="0" value="${escapeHtml(match.setsB ?? '')}" />
                  </label>
                  <label>
                    Games A
                    <input name="gamesA" type="number" min="0" value="${escapeHtml(match.gamesA ?? '')}" />
                  </label>
                  <label>
                    Games B
                    <input name="gamesB" type="number" min="0" value="${escapeHtml(match.gamesB ?? '')}" />
                  </label>
                  <label>
                    Ganador
                    <select name="winnerId">
                      <option value="">Pendiente</option>
                      <option value="${escapeHtml(match.pairAId)}" ${match.winnerId === match.pairAId ? 'selected' : ''}>${escapeHtml(match.pairALabel)}</option>
                      <option value="${escapeHtml(match.pairBId)}" ${match.winnerId === match.pairBId ? 'selected' : ''}>${escapeHtml(match.pairBLabel)}</option>
                    </select>
                  </label>
                  <button type="submit" class="primary">Guardar resultado</button>
                </form>
              </details>
            `
            : '';

          return `
            <article class="match-card">
              <header>
                <div>
                  <p class="eyebrow">${escapeHtml(match.roundName || match.stage || 'Partido')}</p>
                  <h3>${escapeHtml(match.pairALabel)} vs ${escapeHtml(match.pairBLabel)}</h3>
                </div>
                <span class="chip ${match.played ? 'is-success' : ''}">${escapeHtml(winnerLabel)}</span>
              </header>
              <p class="match-meta">${escapeHtml(formatDateTimeLabel(match.date, match.time))} · ${escapeHtml(match.venue || 'Sin sede')}</p>
              <p class="meta">Sets ${escapeHtml(match.setsA ?? '-')} - ${escapeHtml(match.setsB ?? '-')} · Games ${escapeHtml(match.gamesA ?? '-')} - ${escapeHtml(match.gamesB ?? '-')}</p>
              ${adminBlock}
            </article>
          `;
        })
        .join('');

      return `
        <article class="fixture-day">
          <header>
            <p class="day-label">${escapeHtml(dateLabel)}</p>
            <p class="meta">${escapeHtml(dayMatches.length)} partido${dayMatches.length === 1 ? '' : 's'}</p>
          </header>
          <div class="stack-list">${cards}</div>
        </article>
      `;
    })
    .join('');
};

const renderStandings = () => {
  if (!standingsList) {
    return;
  }

  const category = getSelectedCategory();
  if (!category) {
    standingsList.innerHTML = '<div class="card">No hay categoría seleccionada.</div>';
    return;
  }

  const rows = category.standings || [];
  if (!rows.length) {
    standingsList.innerHTML = '<div class="card">Todavía no hay tabla generada.</div>';
    return;
  }

  standingsList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Pareja</th>
          <th>PJ</th>
          <th>PTS</th>
          <th>SETS</th>
          <th>GAMES</th>
          <th>DS</th>
          <th>DG</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row, index) => {
            const setsFor = Number(row.setsFor ?? row.sets_for ?? 0);
            const setsAgainst = Number(row.setsAgainst ?? row.sets_against ?? 0);
            const gamesFor = Number(row.gamesFor ?? row.games_for ?? 0);
            const gamesAgainst = Number(row.gamesAgainst ?? row.games_against ?? 0);
            const matchesPlayed = Number(row.matchesPlayed ?? row.matches_played ?? 0);
            const points = Number(row.points ?? 0);
            const setDiff = setsFor - setsAgainst;
            const gameDiff = gamesFor - gamesAgainst;
            return `
              <tr class="table-row ${index < 3 ? 'is-top' : ''}">
                <td>${escapeHtml(row.name || row.pairLabel || 'Pareja')}</td>
                <td>${escapeHtml(matchesPlayed)}</td>
                <td>${escapeHtml(points)}</td>
                <td>${escapeHtml(`${setsFor}-${setsAgainst}`)}</td>
                <td>${escapeHtml(`${gamesFor}-${gamesAgainst}`)}</td>
                <td>${escapeHtml(setDiff)}</td>
                <td>${escapeHtml(gameDiff)}</td>
              </tr>
            `;
          })
          .join('')}
      </tbody>
    </table>
  `;
};

const renderGroups = () => {
  if (!groupsList) {
    return;
  }

  const category = getSelectedCategory();
  if (!category) {
    groupsList.innerHTML = '<div class="card">No hay categoría seleccionada.</div>';
    return;
  }

  const groups = category.groups || [];
  if (!groups.length) {
    groupsList.innerHTML = '<div class="card">Todavía no hay grupos generados.</div>';
    return;
  }

  groupsList.innerHTML = groups
    .map((group) => {
      const pairNames = (group.pairs || []).map((pair) => escapeHtml(getPairLabel(pair))).join(' · ') || 'Sin parejas';
      return `
        <article class="match-card">
          <header>
            <div>
              <p class="eyebrow">${escapeHtml(group.name || 'Grupo')}</p>
              <h3>${escapeHtml(group.name || 'Grupo')}</h3>
            </div>
            <span class="chip">${escapeHtml((group.pairs || []).length)} parejas</span>
          </header>
          <p class="meta">${pairNames}</p>
        </article>
      `;
    })
    .join('');
};

const renderBracket = () => {
  if (!bracketList) {
    return;
  }

  const category = getSelectedCategory();
  if (!category) {
    bracketList.innerHTML = '<div class="card">No hay categoría seleccionada.</div>';
    return;
  }

  const rounds = category.bracket || [];
  if (!rounds.length) {
    bracketList.innerHTML = '<div class="card">Todavía no hay cuadro generado.</div>';
    return;
  }

  bracketList.innerHTML = rounds
    .map(
      (round) => `
        <article class="standings-card">
          <header>
            <div>
              <p class="eyebrow">${escapeHtml(round.name)}</p>
              <h3>${escapeHtml(round.name)}</h3>
            </div>
          </header>
          <div class="stack-list">
            ${(round.matches || [])
              .map(
                (match) => `
                  <div class="match-card">
                    <strong>${escapeHtml(match.pairALabel || 'Pendiente')} vs ${escapeHtml(match.pairBLabel || 'Pendiente')}</strong>
                    <p class="meta">Estado: ${escapeHtml(match.played ? 'Jugado' : 'Pendiente')}</p>
                    <p class="meta">Ganador: ${escapeHtml(match.winnerId ? (category.pairs.find((pair) => pair.id === match.winnerId)?.name || 'Pendiente') : 'Pendiente')}</p>
                  </div>
                `,
              )
              .join('')}
          </div>
        </article>
      `,
    )
    .join('');
};

const renderBracketResults = () => {
  if (!bracketResultsList) {
    return;
  }

  const category = getSelectedCategory();
  if (!category) {
    bracketResultsList.innerHTML = '<div class="card">No hay categoría seleccionada.</div>';
    return;
  }

  const playedMatches = category.matches?.filter((match) => match.played) || [];
  if (!playedMatches.length) {
    bracketResultsList.innerHTML = '<div class="card">Todavía no hay resultados de cuadro.</div>';
    return;
  }

  bracketResultsList.innerHTML = playedMatches
    .map(
      (match) => `
        <article class="result-card">
          <strong>${escapeHtml(match.pairALabel)} vs ${escapeHtml(match.pairBLabel)}</strong>
          <p class="result-meta">${escapeHtml(match.roundName || match.stage || 'Partido')} · Ganador: ${escapeHtml(match.winnerId ? (category.pairs.find((pair) => pair.id === match.winnerId)?.name || 'Pendiente') : 'Pendiente')}</p>
        </article>
      `,
    )
    .join('');
};

const renderRules = () => {
  if (!rulesList) {
    return;
  }

  rulesList.innerHTML = rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join('');
};

const renderPairs = () => {
  if (!pairsList) {
    return;
  }

  const category = getSelectedCategory();
  if (!category) {
    pairsList.innerHTML = '<div class="card">No hay categoría seleccionada.</div>';
    return;
  }

  const pairCards = (category.pairs || []).map((pair) => {
    const cardActions = isAdminUnlocked()
      ? `
        <div class="card-actions">
          <button type="button" class="secondary" data-edit-pair="${escapeHtml(pair.id)}">Editar</button>
          <button type="button" class="secondary is-danger" data-delete-pair="${escapeHtml(pair.id)}">Borrar</button>
        </div>
      `
      : '';

    return `
      <article class="pair-card">
        <header>
          <div>
            <p class="eyebrow">Pareja</p>
            <h3>${escapeHtml(getPairLabel(pair))}</h3>
          </div>
        </header>
        <p class="meta">${escapeHtml(getPlayerLabel(pair.playerOne))} / ${escapeHtml(getPlayerLabel(pair.playerTwo))}</p>
        ${cardActions}
      </article>
    `;
  });

  const waitlistCards = (category.waitlist || []).map(
    (entry) => `
      <article class="waitlist-card">
        <header>
          <div>
            <p class="eyebrow">Lista de espera</p>
            <h3>${escapeHtml(getPlayerLabel(entry.player))} / ${escapeHtml(getPlayerLabel(entry.partner))}</h3>
          </div>
          <span class="chip">${escapeHtml(entry.status || 'pendiente')}</span>
        </header>
        <p class="meta">Solicitado: ${escapeHtml(entry.requestedAt ? new Date(entry.requestedAt).toLocaleString('es-AR') : 'Sin fecha')}</p>
      </article>
    `,
  );

  pairsList.innerHTML = [...pairCards, ...waitlistCards].join('') || '<div class="card">No hay parejas cargadas.</div>';
};

const renderHistory = () => {
  if (!historyRoot) {
    return;
  }

  if (!appState.history.length) {
    historyRoot.innerHTML = '<div class="card">No hay torneos archivados todavía.</div>';
    return;
  }

  historyRoot.innerHTML = appState.history
    .map((entry) => {
      const categories = entry.categories || [];
      return `
        <article class="history-card">
          <header>
            <div>
              <p class="eyebrow">Historial</p>
              <h3>${escapeHtml(entry.event?.name || 'Evento archivado')}</h3>
            </div>
            <span class="chip">${escapeHtml(entry.event?.status || 'Archivado')}</span>
          </header>
          <p class="meta">${escapeHtml(formatDateLabel(entry.event?.date))} · ${escapeHtml(entry.event?.place || '')}</p>
          <div class="stack-list">
            ${categories
              .map(
                (item) => `
                  <div class="match-card">
                    <strong>${escapeHtml(item.category?.name || 'Categoría')}</strong>
                    <p class="meta">Archivada: ${escapeHtml(item.archivedAt ? new Date(item.archivedAt).toLocaleString('es-AR') : 'Sin fecha')}</p>
                    <p class="meta">Estado: ${escapeHtml(item.category?.status || 'Archivada')}</p>
                  </div>
                `,
              )
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');
};

const renderPlayersModal = () => {
  if (!playersList) {
    return;
  }

  if (!appState.players.length) {
    playersList.innerHTML = '<div class="card">No hay jugadores cargados.</div>';
    return;
  }

  playersList.innerHTML = appState.players
    .map((player) => {
      const actions = isAdminUnlocked()
        ? `
          <div class="card-actions">
            <button type="button" class="secondary" data-edit-player="${escapeHtml(player.id)}">Editar</button>
            <button type="button" class="secondary is-danger" data-delete-player="${escapeHtml(player.id)}">Borrar</button>
          </div>
        `
        : '';

      return `
        <article class="player-card">
          <header>
            <div>
              <p class="eyebrow">Jugador</p>
              <h3>${escapeHtml(getPlayerLabel(player))}</h3>
            </div>
            <span class="chip">${escapeHtml(player.accountStatus || 'sin_cuenta')}</span>
          </header>
          <p class="meta">${escapeHtml(player.firstName)} ${escapeHtml(player.lastName)}</p>
          ${player.email ? `<p class="meta">${escapeHtml(player.email)}</p>` : ''}
          ${actions}
        </article>
      `;
    })
    .join('');
};

const renderAdminState = () => {
  const unlocked = isAdminUnlocked();
  if (adminLock) {
    adminLock.hidden = unlocked;
  }
  if (adminContent) {
    adminContent.hidden = !unlocked;
  }
  if (adminLoginError && !unlocked) {
    setAdminLoginError('');
  }

  const event = appState.event || defaultState().event;
  const activeCategory = getSelectedCategory();

  if (eventNameInput) {
    eventNameInput.value = event.name || '';
  }
  if (eventDateInput) {
    eventDateInput.value = event.date || '';
  }
  if (eventModeInput) {
    eventModeInput.value = event.mode || '';
  }
  if (eventPlaceInput) {
    eventPlaceInput.value = event.place || '';
  }
  if (eventCategoryNameInput) {
    eventCategoryNameInput.value = activeCategory?.name || '';
  }
  if (eventMaxPairsInput) {
    eventMaxPairsInput.value = activeCategory?.maxPairs ?? '';
  }
  if (categoryNameInput) {
    categoryNameInput.value = '';
  }
  if (categoryMaxPairsInput) {
    categoryMaxPairsInput.value = '';
  }

  const categoryOptions = appState.categories
    .map(
      (category) => `
        <option value="${escapeHtml(category.id)}" ${category.id === selectedCategoryId ? 'selected' : ''}>${escapeHtml(category.name)}</option>
      `,
    )
    .join('');

  if (categorySelect) {
    categorySelect.innerHTML = categoryOptions || '<option value="">Sin categorías</option>';
    if (selectedCategoryId) {
      categorySelect.value = selectedCategoryId;
    }
  }

  if (adminCategorySelect) {
    adminCategorySelect.innerHTML = categoryOptions || '<option value="">Sin categorías</option>';
    if (selectedCategoryId) {
      adminCategorySelect.value = selectedCategoryId;
    }
  }

  if (pairCategorySelect) {
    pairCategorySelect.innerHTML = categoryOptions || '<option value="">Sin categorías</option>';
    if (selectedCategoryId) {
      pairCategorySelect.value = selectedCategoryId;
    }
  }

  if (categoryWinnerSelect) {
    const selected = activeCategory || appState.categories[0] || null;
    categoryWinnerSelect.innerHTML = selected
      ? ['<option value="">Pendiente</option>', ...(selected.pairs || []).map((pair) => `<option value="${escapeHtml(pair.id)}">${escapeHtml(getPairLabel(pair))}</option>`)].join('')
      : '<option value="">Sin parejas</option>';
  }

  if (playerOneSelect) {
    playerOneSelect.innerHTML = appState.players
      .map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(getPlayerLabel(player))}</option>`)
      .join('');
  }

  if (playerTwoSelect) {
    playerTwoSelect.innerHTML = appState.players
      .map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(getPlayerLabel(player))}</option>`)
      .join('');
  }

  if (activeCategory && pairCategorySelect) {
    pairCategorySelect.value = activeCategory.id;
  }

  syncPairPlayerSelects();
};

const renderMatchEditor = () => {
  if (!matchEditorList) {
    return;
  }

  if (!isAdminUnlocked()) {
    matchEditorList.innerHTML = '<div class="card">Iniciá sesión para editar partidos.</div>';
    return;
  }

  const category = getSelectedCategory();
  if (!category) {
    matchEditorList.innerHTML = '<div class="card">No hay categoría seleccionada.</div>';
    return;
  }

  const matches = category.matches || [];
  if (!matches.length) {
    matchEditorList.innerHTML = '<div class="card">Planificá la categoría para editar sus partidos.</div>';
    return;
  }

  matchEditorList.innerHTML = matches
    .map(
      (match) => `
        <details class="match-card">
          <summary>
            <div>
              <p class="eyebrow">${escapeHtml(match.roundName || match.stage || 'Partido')}</p>
              <h3>${escapeHtml(match.pairALabel)} vs ${escapeHtml(match.pairBLabel)}</h3>
            </div>
            <span class="chip">${escapeHtml(match.played ? 'Jugado' : 'Pendiente')}</span>
          </summary>
          <form class="admin-form" data-match-form="${escapeHtml(match.id)}">
            <label>
              Fecha
              <input name="date" type="date" value="${escapeHtml(match.date || '')}" />
            </label>
            <label>
              Hora
              <input name="time" type="time" value="${escapeHtml(match.time || '')}" />
            </label>
            <label>
              Sede
              <input name="venue" type="text" value="${escapeHtml(match.venue || '')}" />
            </label>
            <label>
              Sets A
              <input name="setsA" type="number" min="0" value="${escapeHtml(match.setsA ?? '')}" />
            </label>
            <label>
              Sets B
              <input name="setsB" type="number" min="0" value="${escapeHtml(match.setsB ?? '')}" />
            </label>
            <label>
              Games A
              <input name="gamesA" type="number" min="0" value="${escapeHtml(match.gamesA ?? '')}" />
            </label>
            <label>
              Games B
              <input name="gamesB" type="number" min="0" value="${escapeHtml(match.gamesB ?? '')}" />
            </label>
            <label>
              Ganador
              <select name="winnerId">
                <option value="">Pendiente</option>
                <option value="${escapeHtml(match.pairAId)}" ${match.winnerId === match.pairAId ? 'selected' : ''}>${escapeHtml(match.pairALabel)}</option>
                <option value="${escapeHtml(match.pairBId)}" ${match.winnerId === match.pairBId ? 'selected' : ''}>${escapeHtml(match.pairBLabel)}</option>
              </select>
            </label>
            <button type="submit" class="primary">Guardar partido</button>
          </form>
        </details>
      `,
    )
    .join('');
};

const renderAll = () => {
  renderTabs();
  renderEventHeader();
  renderCategoryRail();
  renderOverview();
  renderFixture();
  renderGroups();
  renderStandings();
  renderBracket();
  renderBracketResults();
  renderRules();
  renderPairs();
  renderHistory();
  renderAdminState();
  renderPlayersModal();
  renderMatchEditor();
};

const runAction = async (task, feedback) => {
  setAppError('');
  try {
    const result = await task();
    return result;
  } catch (error) {
    if (error?.status === 401) {
      forceLockAdmin();
      renderAll();
    }

    const message = feedback || error?.message || 'No se pudo completar la acción.';
    setAppError(message);
    throw error;
  }
};

const mutate = async (task, feedback) => {
  try {
    await runAction(task, feedback);
    return true;
  } catch {
    return false;
  }
};

const submitPlayerForm = async (event) => {
  event.preventDefault();
  if (!isAdminUnlocked()) {
    return;
  }

  const form = event.currentTarget;
  clearFormError(form, 'player-form');
  setBusy(form, true);

  try {
    const payload = {
      firstName: normalizeText(playerFirstName?.value || ''),
      lastName: normalizeText(playerLastName?.value || ''),
      nickname: normalizeText(playerAlias?.value || ''),
    };

    await runAction(async () => {
      if (playerId?.value) {
        await updatePlayer(playerId.value, payload);
      } else {
        await createPlayer(payload);
      }
    });

    if (playerForm) {
      playerForm.reset();
      if (playerId) {
        playerId.value = '';
      }
    }
    await reloadState();
    renderAll();
  } catch (error) {
    setFormError(form, 'player-form', error?.message || 'No se pudo guardar el jugador.');
  } finally {
    setBusy(form, false);
  }
};

const submitPairForm = async (event) => {
  event.preventDefault();
  if (!isAdminUnlocked()) {
    return;
  }

  const form = event.currentTarget;
  clearFormError(form, 'pair-form');
  setBusy(form, true);

  try {
    const payload = {
      categoryId: pairCategorySelect?.value || selectedCategoryId || '',
      name: normalizeText(pairName?.value || ''),
      playerOneId: playerOneSelect?.value || '',
      playerTwoId: playerTwoSelect?.value || '',
    };

    await runAction(async () => {
      if (pairId?.value) {
        await updatePair(pairId.value, payload);
      } else {
        await createPair(payload);
      }
    });

    if (pairForm) {
      pairForm.reset();
      if (pairId) {
        pairId.value = '';
      }
    }

    await reloadState();
    renderAll();
  } catch (error) {
    setFormError(form, 'pair-form', error?.message || 'No se pudo guardar la pareja.');
  } finally {
    setBusy(form, false);
  }
};

const submitEventForm = async (event) => {
  event.preventDefault();
  if (!isAdminUnlocked()) {
    return;
  }

  const form = event.currentTarget;
  clearFormError(form, 'event-form');
  setBusy(form, true);

  try {
    const payload = {
      name: normalizeText(eventNameInput?.value || ''),
      date: eventDateInput?.value || '',
      mode: eventModeInput?.value || '',
      place: normalizeText(eventPlaceInput?.value || ''),
      categoryName: normalizeText(eventCategoryNameInput?.value || ''),
      maxPairs: eventMaxPairsInput?.value ? Number(eventMaxPairsInput.value) : null,
    };

    await runAction(() => createEvent(payload));
    await reloadState();
    renderAll();
  } catch (error) {
    setFormError(form, 'event-form', error?.message || 'No se pudo crear el evento.');
  } finally {
    setBusy(form, false);
  }
};

const submitCategoryForm = async (event) => {
  event.preventDefault();
  if (!isAdminUnlocked()) {
    return;
  }

  const form = event.currentTarget;
  clearFormError(form, 'category-form');
  setBusy(form, true);

  try {
    const currentEvent = appState.event;
    if (!currentEvent?.id) {
      throw new Error('Creá un evento antes de agregar categorías.');
    }

    const payload = {
      name: normalizeText(categoryNameInput?.value || ''),
      maxPairs: categoryMaxPairsInput?.value ? Number(categoryMaxPairsInput.value) : null,
    };

    await runAction(() => createCategory(currentEvent.id, payload));
    await reloadState();
    renderAll();
  } catch (error) {
    setFormError(form, 'category-form', error?.message || 'No se pudo crear la categoría.');
  } finally {
    setBusy(form, false);
  }
};

const submitMatchForm = async (event) => {
  const form = event.target.closest('form[data-match-form]');
  if (!form) {
    return;
  }

  event.preventDefault();
  if (!isAdminUnlocked()) {
    return;
  }

  const matchId = form.dataset.matchForm;
  clearFormError(form, `match-form-${matchId}`);
  setBusy(form, true);

  try {
    const payload = {
      date: form.querySelector('[name="date"]')?.value || '',
      time: form.querySelector('[name="time"]')?.value || '',
      venue: normalizeText(form.querySelector('[name="venue"]')?.value || ''),
      setsA: form.querySelector('[name="setsA"]')?.value || null,
      setsB: form.querySelector('[name="setsB"]')?.value || null,
      gamesA: form.querySelector('[name="gamesA"]')?.value || null,
      gamesB: form.querySelector('[name="gamesB"]')?.value || null,
      winnerId: form.querySelector('[name="winnerId"]')?.value || null,
    };

    await runAction(() => updateMatch(matchId, payload));
    await reloadState();
    renderAll();
  } catch (error) {
    setFormError(form, `match-form-${matchId}`, error?.message || 'No se pudo guardar el partido.');
  } finally {
    setBusy(form, false);
  }
};

const handleAdminLogin = async (event) => {
  event.preventDefault();
  setAdminLoginError('');

  const username = normalizeText(adminUsername?.value || '');
  const password = String(adminPassword?.value || '');

  if (!username || !password) {
    setAdminLoginError('Ingresá usuario y contraseña.');
    return;
  }

  const form = event.currentTarget;
  setBusy(form, true);

  try {
    await unlockAdmin(username, password);
    if (adminPassword) {
      adminPassword.value = '';
    }
    await reloadState();
    renderAll();
    setActiveTab('admin');
  } catch (error) {
    setAdminLoginError(error?.status === 401 ? 'Credenciales inválidas.' : error?.message || 'No se pudo iniciar sesión.');
  } finally {
    setBusy(form, false);
  }
};

const handleAdminLogout = async () => {
  await lockAdmin();
  forceLockAdmin();
  renderAll();
  setActiveTab('admin');
};

const handleCategoryActions = async (event) => {
  const button = event.target.closest('[data-category-id]');
  if (!button) {
    return;
  }

  setSelectedCategoryId(button.dataset.categoryId);
};

const handleHistoryActions = async (event) => {
  const editPlayerButton = event.target.closest('[data-edit-player]');
  if (editPlayerButton) {
    const player = appState.players.find((item) => item.id === editPlayerButton.dataset.editPlayer);
    if (!player) {
      return;
    }

    if (playerId) {
      playerId.value = player.id;
    }
    if (playerFirstName) {
      playerFirstName.value = player.firstName || '';
    }
    if (playerLastName) {
      playerLastName.value = player.lastName || '';
    }
    if (playerAlias) {
      playerAlias.value = player.nickname || '';
    }

    setActiveTab('admin');
    return;
  }

  const deletePlayerButton = event.target.closest('[data-delete-player]');
  if (deletePlayerButton) {
    const playerIdValue = deletePlayerButton.dataset.deletePlayer;
    if (!playerIdValue) {
      return;
    }

    if (!window.confirm('¿Borrar jugador?')) {
      return;
    }

    if (!(await mutate(async () => {
      await deletePlayer(playerIdValue);
    }))) {
      return;
    }
    await reloadState();
    renderAll();
    return;
  }

  const editPairButton = event.target.closest('[data-edit-pair]');
  if (editPairButton) {
    const pair = appState.pairs.find((item) => item.id === editPairButton.dataset.editPair);
    if (!pair) {
      return;
    }

    if (pairId) {
      pairId.value = pair.id;
    }
    if (pairName) {
      pairName.value = pair.name || '';
    }
    if (playerOneSelect) {
      playerOneSelect.value = pair.playerOneId || '';
    }
    if (playerTwoSelect) {
      playerTwoSelect.value = pair.playerTwoId || '';
    }
    if (pairCategorySelect) {
      pairCategorySelect.value = pair.categoryId || selectedCategoryId || '';
    }

    setActiveTab('admin');
    return;
  }

  const deletePairButton = event.target.closest('[data-delete-pair]');
  if (deletePairButton) {
    const pairIdValue = deletePairButton.dataset.deletePair;
    if (!pairIdValue) {
      return;
    }

    if (!window.confirm('¿Borrar pareja?')) {
      return;
    }

    if (!(await mutate(async () => {
      await deletePair(pairIdValue);
    }))) {
      return;
    }
    await reloadState();
    renderAll();
    return;
  }
};

const handleCategorySelectChange = (event) => {
  const value = event.target?.value || '';
  if (value) {
    setSelectedCategoryId(value);
  }
};

const handleDeleteEvent = async () => {
  if (!appState.event?.id) {
    return;
  }

  if (!window.confirm('¿Eliminar el evento actual?')) {
    return;
  }

  if (!(await mutate(async () => {
    await deleteEvent(appState.event.id);
  }))) {
    return;
  }
  await reloadState();
  renderAll();
};

const handlePlanCategory = async () => {
  const category = getSelectedCategory();
  if (!category) {
    return;
  }

  if (!(await mutate(async () => {
    await planCategory(category.id);
  }))) {
    return;
  }
  await reloadState();
  renderAll();
};

const handleArchiveCategory = async () => {
  const category = getSelectedCategory();
  if (!category) {
    return;
  }

  const winnerPairId = categoryWinnerSelect?.value || category.bracketChampion?.winnerId || category.standings?.[0]?.pairId || '';
  if (!winnerPairId) {
    setAppError('Elegí un ganador antes de archivar la categoría.');
    return;
  }

  if (!(await mutate(async () => {
    await archiveCategory(category.id, { winnerPairId });
  }))) {
    return;
  }
  await reloadState();
  renderAll();
};

const handleLoadSamplePairs = async () => {
  const category = getSelectedCategory();
  if (!category) {
    return;
  }

  const seedPlayers = [
    { firstName: 'Barby', lastName: 'Ambar', nickname: '' },
    { firstName: 'Dani', lastName: 'Maga', nickname: '' },
    { firstName: 'Flor', lastName: 'Anto', nickname: '' },
    { firstName: 'Juli', lastName: 'Lore', nickname: '' },
  ];

  if (!(await mutate(async () => {
    const createdPlayers = [];

    if (appState.players.length < seedPlayers.length) {
      for (const player of seedPlayers) {
        const createdPlayer = await createPlayer(player);
        createdPlayers.push(createdPlayer);
      }
    }

    const currentPlayers = [...appState.players, ...createdPlayers];
    const playerIds = currentPlayers.map((player) => player.id);
    const candidates = [
      [playerIds[0], playerIds[1]],
      [playerIds[2], playerIds[3]],
    ].filter((pair) => pair.every(Boolean));

      for (const [left, right] of candidates) {
        await createPair({
          categoryId: category.id,
          playerOneId: left,
          playerTwoId: right,
        });
      }
  }))) {
    return;
  }

  await reloadState();
  renderAll();
};

const handleClearPairs = async () => {
  const category = getSelectedCategory();
  if (!category) {
    return;
  }

  if (!window.confirm('¿Vaciar parejas de la categoría?')) {
    return;
  }

  if (!(await mutate(async () => {
    for (const pair of category.pairs || []) {
      await deletePair(pair.id);
    }
  }))) {
    return;
  }

  await reloadState();
  renderAll();
};

const openPlayersModalHandler = () => {
  if (!playersModal) {
    return;
  }

  playersModal.hidden = false;
  playersModal.classList.remove('is-hidden');
  playersModal.setAttribute('aria-hidden', 'false');
};

const closePlayersModalHandler = () => {
  if (!playersModal) {
    return;
  }

  playersModal.hidden = true;
  playersModal.classList.add('is-hidden');
  playersModal.setAttribute('aria-hidden', 'true');
};

const handleTabClick = (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) {
    return;
  }

  setActiveTab(button.dataset.tab);
};

const handleThemeClick = () => {
  toggleTheme();
};

const attachListeners = () => {
  document.addEventListener('click', handleTabClick);
  categoryRail?.addEventListener('click', handleCategoryActions);
  overviewList?.addEventListener('click', handleCategoryActions);
  document.addEventListener('click', handleHistoryActions);
  matchEditorList?.addEventListener('submit', submitMatchForm);
  adminLoginForm?.addEventListener('submit', handleAdminLogin);
  adminLogout?.addEventListener('click', handleAdminLogout);
  eventForm?.addEventListener('submit', submitEventForm);
  categoryForm?.addEventListener('submit', submitCategoryForm);
  playerForm?.addEventListener('submit', submitPlayerForm);
  pairForm?.addEventListener('submit', submitPairForm);
  deleteEventButton?.addEventListener('click', handleDeleteEvent);
  planCategoryButton?.addEventListener('click', handlePlanCategory);
  archiveCategoryButton?.addEventListener('click', handleArchiveCategory);
  loadSamplePairsButton?.addEventListener('click', handleLoadSamplePairs);
  clearPairsButton?.addEventListener('click', handleClearPairs);
  openPlayersModal?.addEventListener('click', openPlayersModalHandler);
  openPairsTab?.addEventListener('click', () => setActiveTab('mas'));
  closePlayersModal?.addEventListener('click', closePlayersModalHandler);
  playersModal?.addEventListener('click', (event) => {
    if (event.target?.matches?.('[data-modal-close]')) {
      closePlayersModalHandler();
    }
  });
  themeToggle?.addEventListener('click', handleThemeClick);
  themeToggleMobile?.addEventListener('click', handleThemeClick);
  categorySelect?.addEventListener('change', handleCategorySelectChange);
  adminCategorySelect?.addEventListener('change', handleCategorySelectChange);
  playerOneSelect?.addEventListener('change', () => syncPairPlayerSelects(playerOneSelect));
  playerTwoSelect?.addEventListener('change', () => syncPairPlayerSelects(playerTwoSelect));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePlayersModalHandler();
    }
  });
};

const init = async () => {
  setTheme(themeMode || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  attachListeners();

  try {
    await syncAdminSession();
  } catch (error) {
    if (error?.status !== 401) {
      setAppError(error?.message || 'No se pudo validar la sesión de admin.');
    }
    forceLockAdmin();
  }

  try {
    await reloadState();
  } catch (error) {
    setAppError(error?.message || 'No se pudo cargar el estado inicial.');
  }

  renderAll();
  setActiveTab(activeTab);
};

init().catch((error) => {
  console.error(error);
  setAppError(error?.message || 'No se pudo iniciar la aplicación.');
  renderAll();
});
