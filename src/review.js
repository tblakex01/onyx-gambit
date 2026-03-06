const REVIEW_SCORE_CAP = 100_000;

export function scoreToCp(line) {
  if (!line) return 0;
  if (typeof line.scoreCp === 'number') return line.scoreCp;
  if (typeof line.mate === 'number') {
    const magnitude = REVIEW_SCORE_CAP - Math.min(Math.abs(line.mate), 99) * 500;
    return line.mate > 0 ? magnitude : -magnitude;
  }
  return 0;
}

export function classifyMoveSwing(bestScoreCp, playedScoreCp, playedBest) {
  if (playedBest) return 'best';
  const swing = Math.max(0, bestScoreCp - playedScoreCp);
  if (swing <= 20) return 'excellent';
  if (swing <= 60) return 'good';
  if (swing <= 120) return 'inaccuracy';
  if (swing <= 240) return 'mistake';
  return 'blunder';
}

export function normalizeReviewAnnotations(annotations = [], totalMoves = 0) {
  return Array.from({ length: totalMoves + 1 }, (_, index) => {
    if (index === 0) return null;
    return annotations[index] ?? null;
  });
}

export function createReviewCache(totalMoves = 0, annotations = []) {
  const normalized = normalizeReviewAnnotations(annotations, totalMoves);
  const completed = normalized.slice(1).filter(Boolean).length;
  return {
    status: completed > 0 && completed === totalMoves ? 'ready' : 'idle',
    progress: { completed, total: totalMoves },
    error: null,
    annotations: normalized,
    positionAnalyses: Array.from({ length: totalMoves + 1 }, () => null),
  };
}

export function buildReviewAnnotation({ beforeAnalysis, afterAnalysis, playedFrame }) {
  const bestLine = beforeAnalysis.lines?.[0] ?? null;
  const playedMoveUci = `${playedFrame.move.from}${playedFrame.move.to}${playedFrame.move.promotion ?? ''}`;
  const playedBest = bestLine?.pv?.[0] === playedMoveUci;
  const bestScore = scoreToCp(bestLine);
  const playedScore = -scoreToCp(afterAnalysis.lines?.[0] ?? null);
  return {
    moveIndex: playedFrame.index,
    move: playedFrame.move,
    playedBest,
    swingCp: Math.max(0, bestScore - playedScore),
    classification: classifyMoveSwing(bestScore, playedScore, playedBest),
    bestMove: bestLine?.pv?.[0] ?? null,
    bestLine: bestLine?.pv?.slice(0, 6) ?? [],
  };
}
