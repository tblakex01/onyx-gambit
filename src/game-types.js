export const GAME_MODES = Object.freeze({
  HUMAN: 'human-vs-human',
  PLAY_AI: 'play-against-ai',
  AI_PLAY: 'ai-play',
});

export const PLAYER_TYPES = Object.freeze({
  HUMAN: 'human',
  AI: 'ai',
});

export const ENGINE_PHASES = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  READY: 'ready',
  THINKING: 'thinking',
  ERROR: 'error',
});

export const CLOCK_PRESETS = Object.freeze({
  untimed: { id: 'untimed', label: 'Untimed', initialMs: 0, incrementMs: 0 },
  bullet: { id: 'bullet', label: 'Bullet', initialMs: 60_000, incrementMs: 0 },
  blitz: { id: 'blitz', label: 'Blitz', initialMs: 180_000, incrementMs: 2_000 },
  rapid: { id: 'rapid', label: 'Rapid', initialMs: 600_000, incrementMs: 0 },
  custom: { id: 'custom', label: 'Custom', initialMs: 300_000, incrementMs: 0 },
});

export const AI_DIFFICULTY_OPTIONS = Object.freeze([
  { id: '1', label: 'Novice', skillLevel: 2, moveTimeMs: 350, depth: 8 },
  { id: '2', label: 'Casual', skillLevel: 5, moveTimeMs: 500, depth: 10 },
  { id: '3', label: 'Club', skillLevel: 8, moveTimeMs: 700, depth: 12 },
  { id: '4', label: 'Strong Club', skillLevel: 11, moveTimeMs: 900, depth: 14 },
  { id: '5', label: 'Expert', skillLevel: 14, moveTimeMs: 1_200, depth: 16 },
  { id: '6', label: 'Candidate Master', skillLevel: 17, moveTimeMs: 1_600, depth: 18 },
  { id: '7', label: 'Master', skillLevel: 19, moveTimeMs: 2_200, depth: 20 },
  { id: '8', label: 'Grandmaster', skillLevel: 20, moveTimeMs: 3_000, depth: 22 },
]);

export const DEFAULT_AUTOPLAY_DELAY_MS = 650;
export const DEFAULT_ANALYSIS_TIME_MS = 1_400;
export const DEFAULT_REVIEW_TIME_MS = 700;
export const SAVE_FILE_VERSION = 2;

/**
 * @typedef {'human-vs-human'|'play-against-ai'|'ai-play'} GameMode
 * @typedef {'human'|'ai'} PlayerType
 * @typedef {'idle'|'starting'|'ready'|'thinking'|'error'} EnginePhase
 *
 * @typedef AIConfig
 * @property {boolean} enabled
 * @property {string} difficultyId
 * @property {number} skillLevel
 * @property {number|null} moveTimeMs
 * @property {number|null} depth
 *
 * @typedef ClockConfig
 * @property {string} preset
 * @property {number} initialMs
 * @property {number} incrementMs
 *
 * @typedef ClockState
 * @property {number} whiteMs
 * @property {number} blackMs
 * @property {'w'|'b'|null} activeColor
 * @property {boolean} running
 * @property {boolean} paused
 * @property {'w'|'b'|null} flaggedColor
 *
 * @typedef ReplayState
 * @property {boolean} active
 * @property {number} index
 * @property {boolean} autoplay
 * @property {number} delayMs
 *
 * @typedef SavedGame
 * @property {number} version
 * @property {string} savedAt
 * @property {string} fen
 * @property {string} pgn
 * @property {string|null} result
 * @property {GameMode} mode
 * @property {{white: {type: PlayerType, ai: AIConfig}, black: {type: PlayerType, ai: AIConfig}}} players
 * @property {ClockConfig} clockConfig
 * @property {ClockState} clockState
 * @property {ReplayState} replayState
 * @property {{enabled: boolean, lastLive: unknown, reviewAnnotations: unknown[]}} analysis
 */

export function getDifficultyById(id) {
  return AI_DIFFICULTY_OPTIONS.find((option) => option.id === id) ?? AI_DIFFICULTY_OPTIONS[3];
}

export function createAiConfig(overrides = {}) {
  const preset = getDifficultyById(overrides.difficultyId ?? '4');
  return {
    enabled: overrides.enabled ?? false,
    difficultyId: preset.id,
    skillLevel: overrides.skillLevel ?? preset.skillLevel,
    moveTimeMs: overrides.moveTimeMs ?? preset.moveTimeMs,
    depth: overrides.depth ?? preset.depth,
  };
}

export function createClockConfig(overrides = {}) {
  const preset = CLOCK_PRESETS[overrides.preset] ?? CLOCK_PRESETS.untimed;
  return {
    preset: preset.id,
    initialMs: overrides.initialMs ?? preset.initialMs,
    incrementMs: overrides.incrementMs ?? preset.incrementMs,
  };
}

export function createDefaultPlayers(mode = GAME_MODES.HUMAN, humanColor = 'w') {
  if (mode === GAME_MODES.HUMAN) {
    return {
      white: { type: PLAYER_TYPES.HUMAN, ai: createAiConfig() },
      black: { type: PLAYER_TYPES.HUMAN, ai: createAiConfig() },
    };
  }

  if (mode === GAME_MODES.PLAY_AI) {
    return {
      white: {
        type: humanColor === 'w' ? PLAYER_TYPES.HUMAN : PLAYER_TYPES.AI,
        ai: createAiConfig({ enabled: humanColor !== 'w' }),
      },
      black: {
        type: humanColor === 'b' ? PLAYER_TYPES.HUMAN : PLAYER_TYPES.AI,
        ai: createAiConfig({ enabled: humanColor !== 'b' }),
      },
    };
  }

  return {
    white: { type: PLAYER_TYPES.AI, ai: createAiConfig({ enabled: true }) },
    black: { type: PLAYER_TYPES.AI, ai: createAiConfig({ enabled: true }) },
  };
}

export function createDefaultSetup(overrides = {}) {
  const mode = overrides.mode ?? GAME_MODES.HUMAN;
  const humanColor = overrides.humanColor ?? 'w';
  return {
    mode,
    humanColor,
    players: overrides.players ?? createDefaultPlayers(mode, humanColor),
    clockConfig: createClockConfig(overrides.clockConfig),
    autoplayDelayMs: overrides.autoplayDelayMs ?? DEFAULT_AUTOPLAY_DELAY_MS,
    analysisEnabled: overrides.analysisEnabled ?? false,
  };
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function colorName(color) {
  return color === 'w' ? 'White' : 'Black';
}

export function playerSideKey(color) {
  return color === 'w' ? 'white' : 'black';
}

export function moveColorKey(color) {
  return color === 'w' ? 'white' : 'black';
}
