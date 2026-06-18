export const STORAGE_KEY = 'padelApp.state';
export const ADMIN_SESSION_KEY = 'padelApp.adminSession';
export const ADMIN_PASSWORD = 'padel2026';

export const defaultState = () => ({
  tournament: {
    name: 'Torneo de padel',
    date: '',
    mode: '',
    place: '',
    status: 'Sin torneo activo',
    createdAt: null,
    winnerId: null,
    closedAt: null,
    scoring: {
      win: 1,
      loss: 0,
      noShow: 0,
    },
    rulesVersion: 1,
  },
  players: [],
  pairs: [],
  groups: [],
  matches: [],
  standings: [],
  bracket: [],
  history: [],
  bracketResults: [],
});

export const rules = [
  'La fase de grupos se juega con partidos entre grupos y los puntos van a una tabla general unica.',
  'La clasificacion sale de la tabla general y de ahi se definen los cruces a cuartos.',
  'Victoria: 1 punto. Derrota: 0 puntos.',
  'No presentacion o abandono: derrota por 6-0 6-0 y victoria por 6-0 6-0 para el rival.',
  'Desempate entre dos parejas: enfrentamiento directo, diferencia de sets, diferencia de juegos.',
];
