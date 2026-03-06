function readScore(tokens, startIndex) {
  const kind = tokens[startIndex + 1];
  const raw = Number(tokens[startIndex + 2]);
  if (kind === 'cp' && Number.isFinite(raw)) return { scoreCp: raw, mate: null };
  if (kind === 'mate' && Number.isFinite(raw)) return { scoreCp: null, mate: raw };
  return { scoreCp: null, mate: null };
}

export function parseInfoLine(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;
  const payload = { raw: line, pv: [] };

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === 'depth') payload.depth = Number(tokens[index + 1]);
    if (token === 'seldepth') payload.selDepth = Number(tokens[index + 1]);
    if (token === 'multipv') payload.multiPv = Number(tokens[index + 1]);
    if (token === 'nodes') payload.nodes = Number(tokens[index + 1]);
    if (token === 'nps') payload.nps = Number(tokens[index + 1]);
    if (token === 'time') payload.timeMs = Number(tokens[index + 1]);
    if (token === 'score') Object.assign(payload, readScore(tokens, index));
    if (token === 'pv') {
      payload.pv = tokens.slice(index + 1);
      break;
    }
  }

  return payload;
}

export function parseBestMoveLine(line) {
  const match = line.trim().match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
  if (!match) return null;
  return {
    bestMove: match[1],
    ponder: match[2] ?? null,
  };
}

export function summarizeAnalysis(infoLines = [], multiPv = 1) {
  const byPv = new Map();
  for (const info of infoLines) {
    if (!info?.pv?.length) continue;
    const key = info.multiPv ?? 1;
    const existing = byPv.get(key);
    if (!existing || (info.depth ?? 0) >= (existing.depth ?? 0)) {
      byPv.set(key, info);
    }
  }

  return Array.from(byPv.entries())
    .sort((a, b) => a[0] - b[0])
    .slice(0, multiPv)
    .map(([, info]) => info);
}
