const rules = [
  'La fase de grupos debe ser lo mas pareja posible entre todos los participantes.',
  'Si los grupos no quedan iguales, la clasificacion se normaliza por partido jugado.',
  'Victoria: 3 puntos. Derrota: 1 punto. No presentacion: 0 puntos.',
  'Desempate entre dos parejas: enfrentamiento directo, diferencia de sets, diferencia de juegos.',
  'La vista publica debe mostrar torneo, reglas, parejas, resultados y cuadro.',
  'El panel de admin carga parejas y dispara la planificacion automatica.',
];

const storageKey = 'padelApp.pairs';

const tabButtons = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const rulesList = document.getElementById('rulesList');
const pairsList = document.getElementById('pairsList');
const pairsCount = document.getElementById('pairsCount');
const pairForm = document.getElementById('pairForm');
const clearPairs = document.getElementById('clearPairs');
const planTournament = document.getElementById('planTournament');
const pairName = document.getElementById('pairName');
const playerOne = document.getElementById('playerOne');
const playerTwo = document.getElementById('playerTwo');

const loadPairs = () => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '[]');
  } catch {
    return [];
  }
};

const savePairs = (pairs) => {
  localStorage.setItem(storageKey, JSON.stringify(pairs));
};

const renderRules = () => {
  rulesList.innerHTML = rules.map((rule) => `<li>${rule}</li>`).join('');
};

const renderPairs = () => {
  const pairs = loadPairs();
  pairsCount.textContent = String(pairs.length);

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
            <div class="pair-meta">${pair.playerOne} / ${pair.playerTwo}</div>
          </div>
          <div class="pair-meta">#${index + 1}</div>
        </article>
      `,
    )
    .join('');
};

const setActiveTab = (tabName) => {
  tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === tabName);
  });

  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.id === `tab-${tabName}`);
  });
};

tabButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

pairForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const pairs = loadPairs();
  const nextPair = {
    name: pairName.value.trim(),
    playerOne: playerOne.value.trim(),
    playerTwo: playerTwo.value.trim(),
  };

  pairs.unshift(nextPair);
  savePairs(pairs);
  pairForm.reset();
  renderPairs();
  setActiveTab('parejas');
});

clearPairs.addEventListener('click', () => {
  localStorage.removeItem(storageKey);
  renderPairs();
});

planTournament.addEventListener('click', () => {
  alert('Motor de planificacion pendiente de implementar.');
});

renderRules();
renderPairs();
setActiveTab('torneo');
