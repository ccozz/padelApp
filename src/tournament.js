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
  const baseTarget = Math.max(1, Number.isFinite(targetMatches) ? Math.floor(targetMatches) : 1);
  const pairById = new Map(pairs.map((pair) => [pair.id, pair]));
  const groupByPairId = new Map();

  groups.forEach((group) => {
    group.pairIds.forEach((pairId) => {
      groupByPairId.set(pairId, group.id);
    });
  });

  const pairLabel = (pair) => pairById.get(pair.id)?.name || getPairLabel(pair);

  const createNode = (pair, groupId, need) => ({
    pair,
    groupId,
    need,
    label: pairLabel(pair),
    opponents: new Set(),
  });

  const addFixture = (matches, currentNode, candidateNode) => {
    const matchIndex = matches.length + 1;
    matches.push({
      id: createMatchId(currentNode.pair.id, candidateNode.pair.id, matchIndex),
      stage: 'groups',
      pairAId: currentNode.pair.id,
      pairBId: candidateNode.pair.id,
      pairALabel: currentNode.label,
      pairBLabel: candidateNode.label,
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

    currentNode.opponents.add(candidateNode.pair.id);
    candidateNode.opponents.add(currentNode.pair.id);

    if (currentNode.need > 0) {
      currentNode.need -= 1;
    }

    if (candidateNode.need > 0) {
      candidateNode.need -= 1;
    }
  };

  const candidateCount = (node, nodes) =>
    nodes.reduce((count, candidate) => {
      if (
        candidate.pair.id === node.pair.id ||
        candidate.groupId === node.groupId ||
        node.opponents.has(candidate.pair.id)
      ) {
        return count;
      }

      return count + 1;
    }, 0);

  const buildGreedyFixtures = (nodes) => {
    const matches = [];
    const guardLimit = Math.max(1, nodes.length * nodes.length * Math.max(baseTarget, 1) * 4);

    const pickCurrent = () =>
      nodes
        .filter((node) => node.need > 0)
        .map((node) => ({ node, candidates: candidateCount(node, nodes) }))
        .sort((left, right) => {
          const leftLabel = left.node.label || '';
          const rightLabel = right.node.label || '';
          return (
            left.candidates - right.candidates ||
            right.node.need - left.node.need ||
            leftLabel.localeCompare(rightLabel) ||
            left.node.pair.id.localeCompare(right.node.pair.id)
          );
        })[0]?.node || null;

    const pickCandidate = (currentNode) =>
      nodes
        .filter(
          (node) =>
            node.pair.id !== currentNode.pair.id &&
            node.groupId !== currentNode.groupId &&
            !currentNode.opponents.has(node.pair.id),
        )
        .sort((left, right) => {
          const leftCandidates = candidateCount(left, nodes);
          const rightCandidates = candidateCount(right, nodes);
          const leftLabel = left.label || '';
          const rightLabel = right.label || '';
          return (
            right.need - left.need ||
            leftCandidates - rightCandidates ||
            leftLabel.localeCompare(rightLabel) ||
            left.pair.id.localeCompare(right.pair.id)
          );
        })[0] || null;

    for (let guard = 0; guard < guardLimit; guard += 1) {
      const currentNode = pickCurrent();
      if (!currentNode) {
        break;
      }

      const candidateNode = pickCandidate(currentNode);
      if (!candidateNode) {
        currentNode.need = 0;
        continue;
      }

      addFixture(matches, currentNode, candidateNode);
    }

    return matches;
  };

  if (groups.length === 2) {
    const [groupA, groupB] = groups;
    const groupANodes = groupA.pairIds.map((pairId) => createNode(pairById.get(pairId) || { id: pairId }, groupA.id, baseTarget));
    const groupBNodes = groupB.pairIds.map((pairId) => createNode(pairById.get(pairId) || { id: pairId }, groupB.id, baseTarget));
    const leftTotal = groupANodes.length * baseTarget;
    const rightTotal = groupBNodes.length * baseTarget;
    const lowerNodes = leftTotal > rightTotal ? groupBNodes : groupANodes;
    const upperCount = leftTotal > rightTotal ? groupANodes.length : groupBNodes.length;
    let difference = Math.abs(leftTotal - rightTotal);
    const extraCapacity = lowerNodes.length * Math.max(0, upperCount - baseTarget);

    if (difference > 0 && difference <= extraCapacity) {
      const orderedLowerNodes = [...lowerNodes].sort((left, right) => {
        const leftLabel = left.label || '';
        const rightLabel = right.label || '';
        return left.need - right.need || leftLabel.localeCompare(rightLabel) || left.pair.id.localeCompare(right.pair.id);
      });

      let cursor = 0;
      while (difference > 0) {
        const node = orderedLowerNodes[cursor % orderedLowerNodes.length];
        if (node.need < upperCount) {
          node.need += 1;
          difference -= 1;
        }
        cursor += 1;
      }

      return buildGreedyFixtures([...groupANodes, ...groupBNodes]);
    }

    // Caso límite: si el lado más chico no puede absorber los cruces extra
    // sin superar la cantidad de rivales disponibles, no existe una igualación
    // exacta sin relajar la cuota base. En ese caso se usa el greedy genérico.
    return buildGreedyFixtures([...groupANodes, ...groupBNodes]);
  }

  const nodes = pairs.map((pair) => createNode(pair, groupByPairId.get(pair.id) || null, baseTarget));
  return buildGreedyFixtures(nodes);
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
