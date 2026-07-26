const getPairLabel = (pair) => pair?.name || 'Pareja';

const createMatchId = (seedA, seedB, index) => `match-${seedA}-${seedB}-${index}`;

export const buildBalancedGroups = (pairs, groupCount) => {
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    id: `group-${index + 1}`,
    name: `Grupo ${String.fromCharCode(65 + index)}`,
    pairIds: [],
  }));

  [...pairs].forEach((pair, index) => {
    groups[index % groupCount].pairIds.push(pair.id);
  });

  return groups;
};

export const buildGroupFixtures = (pairs, groups, targetMatches = 2) => {
  const normalizeTarget = (value) => Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
  const requestedTarget = normalizeTarget(targetMatches);
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));

  const shuffle = (items) => {
    const nextItems = [...items];
    for (let index = nextItems.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
    }
    return nextItems;
  };

  const buildMatch = (pairA, pairB, matchIndex) => ({
    id: createMatchId(pairA.id, pairB.id, matchIndex),
    stage: 'groups',
    pairAId: pairA.id,
    pairBId: pairB.id,
    pairALabel: pairById.get(pairA.id)?.name || getPairLabel(pairA),
    pairBLabel: pairById.get(pairB.id)?.name || getPairLabel(pairB),
    date: '',
    time: '',
    venue: '',
    scoreA: null,
    scoreB: null,
    setsA: null,
    setsB: null,
    gamesA: null,
    gamesB: null,
    played: false,
  });

  const buildGroupMatches = (groupPairs) => {
    if (groupPairs.length < 2) {
      return [];
    }

    const maxMatchesPerPair = groupPairs.length - 1;
    let effectiveTarget = Math.min(requestedTarget, maxMatchesPerPair);

    if (effectiveTarget <= 0) {
      return [];
    }

    if (groupPairs.length === 2) {
      // Límite estructural: con 2 parejas solo existe un cruce posible y no se puede alcanzar un target mayor.
      return [buildMatch(groupPairs[0], groupPairs[1], 1)];
    }

    const orderedPairs = shuffle(groupPairs);
    const fixtures = [];
    const usedEdges = new Set();
    const needsParityFallback = effectiveTarget % 2 === 1 && groupPairs.length % 2 === 1;
    const baseTarget = needsParityFallback ? effectiveTarget - 1 : effectiveTarget;

    const addFixture = (indexA, indexB) => {
      const pairA = orderedPairs[indexA];
      const pairB = orderedPairs[indexB];
      if (!pairA || !pairB || pairA.id === pairB.id) {
        return;
      }

      const edgeKey = pairA.id < pairB.id ? `${pairA.id}::${pairB.id}` : `${pairB.id}::${pairA.id}`;
      if (usedEdges.has(edgeKey)) {
        return;
      }

      usedEdges.add(edgeKey);
      fixtures.push(buildMatch(pairA, pairB, fixtures.length + 1));
    };

    if (baseTarget <= 0) {
      const randomizedEdges = [];
      for (let leftIndex = 0; leftIndex < orderedPairs.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < orderedPairs.length; rightIndex += 1) {
          randomizedEdges.push([leftIndex, rightIndex]);
        }
      }

      shuffle(randomizedEdges).some(([leftIndex, rightIndex]) => {
        addFixture(leftIndex, rightIndex);
        return true;
      });

      return fixtures;
    }

    if (effectiveTarget === maxMatchesPerPair) {
      for (let leftIndex = 0; leftIndex < orderedPairs.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < orderedPairs.length; rightIndex += 1) {
          addFixture(leftIndex, rightIndex);
        }
      }

      return fixtures;
    }

    const offsets = [];
    if (effectiveTarget % 2 === 0) {
      for (let offset = 1; offset <= effectiveTarget / 2; offset += 1) {
        offsets.push(offset);
      }
    } else {
      offsets.push(Math.floor(orderedPairs.length / 2));
      for (let offset = 1; offset <= (effectiveTarget - 1) / 2; offset += 1) {
        offsets.push(offset);
      }
    }

    offsets.forEach((offset) => {
      for (let index = 0; index < orderedPairs.length; index += 1) {
        addFixture(index, (index + offset) % orderedPairs.length);
      }
    });

    if (needsParityFallback) {
      const existingPairs = new Set(usedEdges);
      const randomizedEdges = [];
      for (let leftIndex = 0; leftIndex < orderedPairs.length - 1; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < orderedPairs.length; rightIndex += 1) {
          const pairA = orderedPairs[leftIndex];
          const pairB = orderedPairs[rightIndex];
          const edgeKey = pairA.id < pairB.id ? `${pairA.id}::${pairB.id}` : `${pairB.id}::${pairA.id}`;
          if (!existingPairs.has(edgeKey)) {
            randomizedEdges.push([leftIndex, rightIndex]);
          }
        }
      }

      shuffle(randomizedEdges).some(([leftIndex, rightIndex]) => {
        addFixture(leftIndex, rightIndex);
        return true;
      });
    }

    return fixtures;
  };

  return groups.flatMap((group) => {
    const groupPairs = group.pairIds
      .map((pairId) => pairById.get(pairId))
      .filter(Boolean);

    return buildGroupMatches(groupPairs);
  });
};

export const buildStandings = (pairs, matches) => {
  const standings = new Map(
    pairs.map((pair) => [
      pair.id,
      {
        pairId: pair.id,
        name: pair.name,
        playerOne: pair.playerOne,
        playerTwo: pair.playerTwo,
        points: 0,
        setsFor: 0,
        setsAgainst: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        matchesPlayed: 0,
      },
    ]),
  );

  matches.forEach((match) => {
    if (!match.played) {
      return;
    }

    const pairA = standings.get(match.pairAId);
    const pairB = standings.get(match.pairBId);
    if (!pairA || !pairB) {
      return;
    }

    pairA.matchesPlayed += 1;
    pairB.matchesPlayed += 1;

    pairA.gamesFor += match.gamesA ?? 0;
    pairA.gamesAgainst += match.gamesB ?? 0;
    pairB.gamesFor += match.gamesB ?? 0;
    pairB.gamesAgainst += match.gamesA ?? 0;

    pairA.setsFor += match.setsA ?? 0;
    pairA.setsAgainst += match.setsB ?? 0;
    pairB.setsFor += match.setsB ?? 0;
    pairB.setsAgainst += match.setsA ?? 0;

    if (match.winnerId === match.pairAId) {
      pairA.points += 1;
    }

    if (match.winnerId === match.pairBId) {
      pairB.points += 1;
    }
  });

  return [...standings.values()].sort((left, right) => {
    const leftPoints = left.points / Math.max(left.matchesPlayed, 1);
    const rightPoints = right.points / Math.max(right.matchesPlayed, 1);
    const leftSetDiff = left.setsFor - left.setsAgainst;
    const rightSetDiff = right.setsFor - right.setsAgainst;
    const leftGameDiff = left.gamesFor - left.gamesAgainst;
    const rightGameDiff = right.gamesFor - right.gamesAgainst;
    const headToHead = getHeadToHeadWinner(left.pairId, right.pairId, matches);

    return (
      rightPoints - leftPoints ||
      headToHead ||
      rightSetDiff - leftSetDiff ||
      rightGameDiff - leftGameDiff ||
      (left.name || '').localeCompare(right.name || '')
    );
  });
};

const getHeadToHeadWinner = (leftPairId, rightPairId, matches) => {
  const directMatches = matches.filter(
    (match) =>
      match.played &&
      ((match.pairAId === leftPairId && match.pairBId === rightPairId) ||
        (match.pairAId === rightPairId && match.pairBId === leftPairId)),
  );

  if (directMatches.length === 0) {
    return 0;
  }

  let leftWins = 0;
  let rightWins = 0;

  directMatches.forEach((match) => {
    if (match.winnerId === leftPairId) {
      leftWins += 1;
    }

    if (match.winnerId === rightPairId) {
      rightWins += 1;
    }
  });

  return rightWins - leftWins;
};

export const buildKnockoutBracket = (standings, pairs, cutoff = 8) => {
  const pairMap = new Map(pairs.map((pair) => [pair.id, pair]));
  const seeded = standings.slice(0, Math.min(cutoff, standings.length));

  if (seeded.length < 2) {
    return [];
  }

  const buildSeededMatch = (seedA, seedB, id) => {
    const pairA = seeded[seedA];
    const pairB = seeded[seedB];

    if (!pairA || !pairB) {
      return null;
    }

    return {
      id,
      basePairIds: [pairA.pairId, pairB.pairId],
      pairAId: pairA.pairId,
      pairBId: pairB.pairId,
      pairALabel: pairMap.get(pairA.pairId)?.name || pairA.name,
      pairBLabel: pairMap.get(pairB.pairId)?.name || pairB.name,
    };
  };

  const buildLinkedMatch = (id, sourceMatchIds) => ({
    id,
    sourceMatchIds,
    pairAId: null,
    pairBId: null,
    pairALabel: 'Pendiente',
    pairBLabel: 'Pendiente',
  });

  if (seeded.length >= 8) {
    return [
      {
        name: 'Cuartos',
        matches: [
          buildSeededMatch(0, 7, 'qf1'),
          buildSeededMatch(3, 4, 'qf2'),
          buildSeededMatch(1, 6, 'qf3'),
          buildSeededMatch(2, 5, 'qf4'),
        ].filter(Boolean),
      },
      {
        name: 'Semifinales',
        matches: [
          buildLinkedMatch('sf1', ['qf1', 'qf2']),
          buildLinkedMatch('sf2', ['qf3', 'qf4']),
        ],
      },
      {
        name: 'Final',
        matches: [buildLinkedMatch('final', ['sf1', 'sf2'])],
      },
    ];
  }

  if (seeded.length >= 4) {
    return [
      {
        name: 'Semifinales',
        matches: [
          buildSeededMatch(0, 3, 'sf1'),
          buildSeededMatch(1, 2, 'sf2'),
        ].filter(Boolean),
      },
      {
        name: 'Final',
        matches: [buildLinkedMatch('final', ['sf1', 'sf2'])],
      },
    ];
  }

  return [
    {
      name: 'Final',
      matches: [
        buildSeededMatch(0, 1, 'final'),
      ].filter(Boolean),
    },
  ];
};

export const flattenBracket = (bracket) =>
  bracket.flatMap((round) =>
    round.matches.map((match) => ({
      roundName: round.name,
      ...match,
    })),
  );

export const resolveBracketWinner = (bracket, bracketResults, pairs) => {
  const pairMap = new Map(pairs.map((pair) => [pair.id, pair]));
  const resultMap = new Map(bracketResults.map((result) => [result.matchId, result]));
  const resolvedMatches = new Map();

  const resolvedBracket = bracket.map((round) => {
    const resolvedRoundMatches = round.matches.map((match) => {
      let pairAId = match.pairAId || null;
      let pairBId = match.pairBId || null;

      if ((!pairAId || !pairBId) && Array.isArray(match.sourceMatchIds)) {
        const sourceA = resolvedMatches.get(match.sourceMatchIds[0]);
        const sourceB = resolvedMatches.get(match.sourceMatchIds[1]);
        pairAId = sourceA?.winnerId || null;
        pairBId = sourceB?.winnerId || null;
      }

      const result = resultMap.get(match.id);
      const played = Boolean(result && pairAId && pairBId);
      const winnerId = played ? result.winnerId : null;
      const loserId = played && winnerId ? (winnerId === pairAId ? pairBId : pairAId) : null;

      const resolvedMatch = {
        ...match,
        pairAId,
        pairBId,
        pairALabel: pairAId ? pairMap.get(pairAId)?.name || 'Ganador' : 'Pendiente',
        pairBLabel: pairBId ? pairMap.get(pairBId)?.name || 'Ganador' : 'Pendiente',
        played,
        winnerId,
        loserId,
        ready: Boolean(pairAId && pairBId),
      };

      resolvedMatches.set(match.id, resolvedMatch);
      return resolvedMatch;
    });

    return {
      ...round,
      matches: resolvedRoundMatches,
    };
  });

  const finalRound = resolvedBracket[resolvedBracket.length - 1];
  const finalMatch = finalRound?.matches?.[0];
  const champion = finalMatch?.played && finalMatch?.winnerId
    ? {
        winnerId: finalMatch.winnerId,
        winnerName: pairMap.get(finalMatch.winnerId)?.name || 'Ganador',
      }
    : null;

  return {
    played: flattenBracket(resolvedBracket),
    champion,
  };
};
