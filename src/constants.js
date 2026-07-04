export const defaultState = () => ({
  event: {
    id: '',
    name: 'Torneo de pádel',
    date: '',
    mode: '',
    place: '',
    status: 'Sin evento activo',
    createdAt: null,
    winnerId: '',
    closedAt: null,
    scoring: {
      win: 1,
      loss: 0,
      noShow: 0,
    },
    rulesVersion: 1,
  },
  categories: [],
  selectedCategoryId: null,
  selectedCategory: null,
  players: [],
  pairs: [],
  groups: [],
  matches: [],
  standings: [],
  bracket: [],
  bracketResults: [],
  bracketChampion: null,
  history: [],
});

export const rules = [
  'Cada evento contiene una o más categorías; cada categoría se planifica y archiva por separado.',
  'Las parejas pertenecen a una categoría, no al evento completo.',
  'Victoria: 1 punto. Derrota: 0 puntos.',
  'No presentación o abandono: derrota por 6-0 6-0 y victoria para el rival por 6-0 6-0.',
  'Desempate entre dos parejas: enfrentamiento directo, diferencia de sets y diferencia de games.',
];
