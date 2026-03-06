import {
  APP_PROTOCOL,
  APP_PROTOCOL_HOST,
  MAX_AUTOSAVE_BYTES,
  MAX_CLIPBOARD_TEXT_LENGTH,
  MAX_DEFAULT_PATH_LENGTH,
  MAX_DIALOG_TITLE_LENGTH,
  MAX_FILTER_COUNT,
  MAX_FILTER_EXTENSION_COUNT,
  MAX_TEXT_FILE_BYTES,
  assertFileSize,
  assertInteger,
  assertObject,
  assertOptionalText,
  assertText,
  normalizeFenText,
  normalizeLoopbackDevServerUrl,
} from '../src/security-policy.js';

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:']);

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
    const allowed = new URL(normalizeLoopbackDevServerUrl(devServerUrl));
    return target.protocol === allowed.protocol && target.host === allowed.host;
  } catch {
    return false;
  }
}

export function isTrustedRendererUrl(candidate, devServerUrl) {
  if (isAllowedRendererNavigation(candidate, devServerUrl)) return true;
  try {
    const url = new URL(candidate);
    return url.protocol === `${APP_PROTOCOL}:` && url.host === APP_PROTOCOL_HOST;
  } catch {
    return false;
  }
}

export function assertTrustedIpcSender(event, mainWindow, devServerUrl) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Blocked IPC because the main window is unavailable.');
  }
  if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Blocked IPC from an untrusted sender frame.');
  }
  if (!isTrustedRendererUrl(event.senderFrame.url, devServerUrl)) {
    throw new Error(`Blocked IPC from unexpected origin: ${event.senderFrame.url}`);
  }
}

export function validateOpenedTextFileSize(size) {
  return assertFileSize(size, 'opened file', MAX_TEXT_FILE_BYTES);
}

export function validateAutosaveFileSize(size) {
  return assertFileSize(size, 'autosave file', MAX_AUTOSAVE_BYTES);
}

export function validateDevServerUrl(candidate) {
  return normalizeLoopbackDevServerUrl(candidate);
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
      maxLength: MAX_TEXT_FILE_BYTES,
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
    maxLength: MAX_AUTOSAVE_BYTES,
    allowEmpty: true,
  });
}

export function validateEnginePayload(payload, { allowDepth = true, defaultMultiPv = 1 } = {}) {
  const normalized = assertObject(payload, 'engine payload');
  return {
    fen: normalizeFenText(normalized.fen),
    skillLevel: assertInteger(normalized.skillLevel ?? 10, 'skillLevel', { min: 0, max: 20 }),
    moveTimeMs: assertInteger(normalized.moveTimeMs ?? 1_000, 'moveTimeMs', { min: 100, max: 60_000 }),
    depth: allowDepth ? assertInteger(normalized.depth, 'depth', { min: 1, max: 30, optional: true }) : null,
    multiPv: assertInteger(normalized.multiPv ?? defaultMultiPv, 'multiPv', { min: 1, max: 4 }),
  };
}
