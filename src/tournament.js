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

export const buildBalancedCrossGroupFixtures = (pairs, groups, targetMatches = 2) => {
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const matches = [];
  const pairState = new Map(
    pairs.map((pair) => [
      pair.id,
      {
        remaining: targetMatches,
        opponents: new Set(),
      },
    ]),
  );

  const orderedPairs = [...pairs].sort((left, right) => {
    const stateLeft = pairState.get(left.id);
    const stateRight = pairState.get(right.id);
    return stateRight.remaining - stateLeft.remaining || left.name.localeCompare(right.name);
  });

  const getGroupIdForPair = (pairId) =>
    groups.find((group) => group.pairIds.includes(pairId))?.id || null;

  const canPair = (pairAId, pairBId) => {
    if (pairAId === pairBId) {
      return false;
    }

    const pairAState = pairState.get(pairAId);
    const pairBState = pairState.get(pairBId);
    if (!pairAState || !pairBState) {
      return false;
    }

    if (pairAState.remaining <= 0 || pairBState.remaining <= 0) {
      return false;
    }

    if (pairAState.opponents.has(pairBId) || pairBState.opponents.has(pairAId)) {
      return false;
    }

    const pairAGroupId = getGroupIdForPair(pairAId);
    const pairBGroupId = getGroupIdForPair(pairBId);
    return Boolean(pairAGroupId && pairBGroupId && pairAGroupId !== pairBGroupId);
  };

  const candidateCount = (pairId) =>
    orderedPairs.reduce((count, candidate) => count + (canPair(pairId, candidate.id) ? 1 : 0), 0);

  const pickNextPair = () =>
    orderedPairs
      .filter((pair) => pairState.get(pair.id)?.remaining > 0)
      .sort((left, right) => candidateCount(left.id) - candidateCount(right.id) || pairState.get(right.id).remaining - pairState.get(left.id).remaining)[0];

  const placeMatches = () => {
    const currentPair = pickNextPair();
    if (!currentPair) {
      return true;
    }

    const currentState = pairState.get(currentPair.id);
    const candidates = orderedPairs
      .filter((candidate) => canPair(currentPair.id, candidate.id))
      .sort((left, right) => {
        const leftState = pairState.get(left.id);
        const rightState = pairState.get(right.id);
        return rightState.remaining - leftState.remaining || left.name.localeCompare(right.name);
      });

    for (const candidate of candidates) {
      const candidateState = pairState.get(candidate.id);
      const matchIndex = matches.length + 1;

      matches.push({
        id: createMatchId(currentPair.id, candidate.id, matchIndex),
        stage: 'groups',
        pairAId: currentPair.id,
        pairBId: candidate.id,
        pairALabel: pairById.get(currentPair.id)?.name || getPairLabel(currentPair),
        pairBLabel: pairById.get(candidate.id)?.name || getPairLabel(candidate),
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

      currentState.remaining -= 1;
      candidateState.remaining -= 1;
      currentState.opponents.add(candidate.id);
      candidateState.opponents.add(currentPair.id);

      if (placeMatches()) {
        return true;
      }

      currentState.remaining += 1;
      candidateState.remaining += 1;
      currentState.opponents.delete(candidate.id);
      candidateState.opponents.delete(currentPair.id);
      matches.pop();
    }

    return false;
  };

  placeMatches();

  if (matches.length === 0 && pairs.length >= 2) {
    const fallbackPairs = [...pairs].sort((left, right) => left.name.localeCompare(right.name, 'es'));

    for (let index = 0; index + 1 < fallbackPairs.length; index += 2) {
      const pairA = fallbackPairs[index];
      const pairB = fallbackPairs[index + 1];

      matches.push({
        id: createMatchId(pairA.id, pairB.id, index + 1),
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
    }
  }

  return matches;
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
      left.name.localeCompare(right.name)
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
