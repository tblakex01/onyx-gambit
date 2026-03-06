const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:']);
const MAX_DIALOG_TITLE_LENGTH = 120;
const MAX_DEFAULT_PATH_LENGTH = 240;
const MAX_TEXT_FILE_LENGTH = 1_000_000;
const MAX_AUTOSAVE_LENGTH = 1_000_000;
const MAX_CLIPBOARD_TEXT_LENGTH = 10_000;
const MAX_FILTER_COUNT = 6;
const MAX_FILTER_EXTENSION_COUNT = 8;
const MAX_FEN_LENGTH = 120;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function assertText(value, label, { maxLength, allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const normalized = value.trim();
  if (!allowEmpty && !normalized) throw new TypeError(`${label} is required.`);
  if (normalized.includes('\0')) throw new TypeError(`${label} must not contain null bytes.`);
  if (maxLength && normalized.length > maxLength) throw new TypeError(`${label} must be <= ${maxLength} characters.`);
  return normalized;
}

function assertOptionalText(value, label, options = {}) {
  if (value == null || value === '') return null;
  return assertText(value, label, options);
}

function assertInteger(value, label, { min, max, optional = false } = {}) {
  if (value == null && optional) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) throw new TypeError(`${label} must be an integer.`);
  if (min != null && numeric < min) throw new RangeError(`${label} must be >= ${min}.`);
  if (max != null && numeric > max) throw new RangeError(`${label} must be <= ${max}.`);
  return numeric;
}

function normalizeFilters(filters) {
  if (filters == null) return [];
  if (!Array.isArray(filters) || filters.length > MAX_FILTER_COUNT) {
    throw new TypeError('Dialog filters must be a short array.');
  }
  return filters.map((filter, index) => {
    const normalized = assertObject(filter, `filters[${index}]`);
    const name = assertText(normalized.name, `filters[${index}].name`, { maxLength: 40 });
    if (!Array.isArray(normalized.extensions) || normalized.extensions.length === 0) {
      throw new TypeError(`filters[${index}].extensions must be a non-empty array.`);
    }
    if (normalized.extensions.length > MAX_FILTER_EXTENSION_COUNT) {
      throw new RangeError(`filters[${index}].extensions must have at most ${MAX_FILTER_EXTENSION_COUNT} entries.`);
    }
    const extensions = normalized.extensions.map((extension, extensionIndex) => {
      const value = assertText(extension, `filters[${index}].extensions[${extensionIndex}]`, {
        maxLength: 12,
      }).toLowerCase();
      if (!/^[a-z0-9]+$/.test(value)) {
        throw new TypeError(`filters[${index}].extensions[${extensionIndex}] must be alphanumeric.`);
      }
      return value;
    });
    return { name, extensions };
  });
}

function normalizeFen(value) {
  const fen = assertText(value, 'fen', { maxLength: MAX_FEN_LENGTH });
  if (/[\r\n]/.test(fen)) throw new TypeError('fen must not contain line breaks.');
  return fen;
}

export function isSafeExternalUrl(candidate) {
  try {
    const url = new URL(candidate);
    return SAFE_EXTERNAL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export function isAllowedRendererNavigation(candidate, devServerUrl) {
  if (!devServerUrl) return false;
  try {
    const target = new URL(candidate);
    const allowed = new URL(devServerUrl);
    return target.protocol === allowed.protocol && target.host === allowed.host;
  } catch {
    return false;
  }
}

export function validateSaveTextPayload(payload) {
  const normalized = assertObject(payload, 'save payload');
  return {
    title: assertText(normalized.title, 'title', { maxLength: MAX_DIALOG_TITLE_LENGTH }),
    defaultPath: assertOptionalText(normalized.defaultPath, 'defaultPath', {
      maxLength: MAX_DEFAULT_PATH_LENGTH,
    }) ?? 'onyx-gambit.txt',
    filters: normalizeFilters(normalized.filters),
    content: assertText(normalized.content, 'content', {
      maxLength: MAX_TEXT_FILE_LENGTH,
      allowEmpty: true,
    }),
  };
}

export function validateOpenTextPayload(payload) {
  const normalized = assertObject(payload, 'open payload');
  return {
    title: assertText(normalized.title, 'title', { maxLength: MAX_DIALOG_TITLE_LENGTH }),
    filters: normalizeFilters(normalized.filters),
  };
}

export function validateClipboardText(text) {
  return assertText(text, 'clipboard text', {
    maxLength: MAX_CLIPBOARD_TEXT_LENGTH,
    allowEmpty: true,
  });
}

export function validateAutosaveContent(content) {
  return assertText(content, 'autosave content', {
    maxLength: MAX_AUTOSAVE_LENGTH,
    allowEmpty: true,
  });
}

export function validateEnginePayload(payload, { allowDepth = true, defaultMultiPv = 1 } = {}) {
  const normalized = assertObject(payload, 'engine payload');
  return {
    fen: normalizeFen(normalized.fen),
    skillLevel: assertInteger(normalized.skillLevel ?? 10, 'skillLevel', { min: 0, max: 20 }),
    moveTimeMs: assertInteger(normalized.moveTimeMs ?? 1_000, 'moveTimeMs', { min: 100, max: 60_000 }),
    depth: allowDepth ? assertInteger(normalized.depth, 'depth', { min: 1, max: 30, optional: true }) : null,
    multiPv: assertInteger(normalized.multiPv ?? defaultMultiPv, 'multiPv', { min: 1, max: 4 }),
  };
}
