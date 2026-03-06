export const APP_PROTOCOL = 'app';
export const APP_PROTOCOL_HOST = 'onyx-gambit';
export const APP_ENTRYPOINT = `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}/index.html`;
export const MAX_TEXT_FILE_BYTES = 1_000_000;
export const MAX_AUTOSAVE_BYTES = 1_000_000;
export const MAX_TEXT_FILE_LENGTH = MAX_TEXT_FILE_BYTES;
export const MAX_AUTOSAVE_LENGTH = MAX_AUTOSAVE_BYTES;
export const MAX_DIALOG_TITLE_LENGTH = 120;
export const MAX_DEFAULT_PATH_LENGTH = 240;
export const MAX_CLIPBOARD_TEXT_LENGTH = 10_000;
export const MAX_FILTER_COUNT = 6;
export const MAX_FILTER_EXTENSION_COUNT = 8;
export const MAX_FEN_LENGTH = 120;
export const MAX_PGN_LENGTH = MAX_TEXT_FILE_BYTES;
export const MAX_DEV_SERVER_URL_LENGTH = 512;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

export function assertText(value, label, { maxLength, allowEmpty = false, trim = true } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string.`);
  const normalized = trim ? value.trim() : value;
  if (!allowEmpty && !normalized) throw new TypeError(`${label} is required.`);
  if (normalized.includes('\0')) throw new TypeError(`${label} must not contain null bytes.`);
  if (maxLength && normalized.length > maxLength) {
    throw new TypeError(`${label} must be <= ${maxLength} characters.`);
  }
  return normalized;
}

export function assertOptionalText(value, label, options = {}) {
  if (value == null || value === '') return null;
  return assertText(value, label, options);
}

export function assertInteger(value, label, { min, max, optional = false } = {}) {
  if (value == null && optional) return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) throw new TypeError(`${label} must be an integer.`);
  if (min != null && numeric < min) throw new RangeError(`${label} must be >= ${min}.`);
  if (max != null && numeric > max) throw new RangeError(`${label} must be <= ${max}.`);
  return numeric;
}

export function assertFileSize(size, label, maxBytes) {
  if (!Number.isFinite(size) || size < 0) throw new RangeError(`${label} size is invalid.`);
  if (size > maxBytes) throw new RangeError(`${label} must be <= ${maxBytes} bytes.`);
  return size;
}

export function normalizeFenText(value, label = 'fen') {
  const fen = assertText(value, label, { maxLength: MAX_FEN_LENGTH });
  if (/[\r\n]/.test(fen)) throw new TypeError(`${label} must not contain line breaks.`);
  return fen;
}

export function normalizePgnText(value, label = 'pgn') {
  return assertText(value, label, { maxLength: MAX_PGN_LENGTH });
}

export function normalizeLoopbackDevServerUrl(candidate) {
  if (candidate == null || candidate === '') return null;
  const normalized = assertText(candidate, 'dev server url', {
    maxLength: MAX_DEV_SERVER_URL_LENGTH,
  });
  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new TypeError('dev server url must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('dev server url must use http or https.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new TypeError('dev server url must point to a loopback host.');
  }
  return url.toString().replace(/\/$/, '');
}
