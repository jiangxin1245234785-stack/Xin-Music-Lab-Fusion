'use strict';

const path = require('path');
const fs = require('fs/promises');

const CONTRACT = 'xin.glitch-preset-repository/1';
const VERSION = '5.4.0-file-repository';
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const WRITABLE_CATEGORIES = new Set(['user', 'recovered']);
let temporarySerial = 0;

function safeJsonObject(json) {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_JSON_BYTES) {
    throw new Error('PRESET_REPOSITORY_JSON_SIZE_INVALID');
  }
  let parsed;
  try { parsed = JSON.parse(json); }
  catch (_) { throw new Error('PRESET_REPOSITORY_JSON_PARSE_FAILED'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PRESET_REPOSITORY_PRESET_INVALID');
  }
  if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion < 0) {
    throw new Error('PRESET_REPOSITORY_SCHEMA_INVALID');
  }
  return parsed;
}

function safeFilename(value, fallback = 'preset') {
  const stem = String(value || fallback)
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
  return `${stem.replace(/\.json$/i, '')}.json`;
}

function categoryPath(root, category) {
  if (!WRITABLE_CATEGORIES.has(category)) {
    throw new Error('PRESET_REPOSITORY_CATEGORY_READ_ONLY');
  }
  return path.join(root, category);
}

function entryFrom(category, filename, json, parsed) {
  return Object.freeze({
    category,
    key: filename,
    id: String(parsed.id || filename.replace(/\.json$/i, '')),
    name: String(parsed.name || parsed.id || filename.replace(/\.json$/i, '')),
    schemaVersion: Number(parsed.schemaVersion),
    bytes: Buffer.byteLength(json, 'utf8'),
    readOnly: category !== 'user'
  });
}

function createRepository(options = {}) {
  const rootInput = String(options.root || '').trim();
  if (!rootInput) throw new Error('PRESET_REPOSITORY_ROOT_REQUIRED');
  const root = path.resolve(rootInput);

  async function initialize() {
    for (const category of WRITABLE_CATEGORIES) {
      const directory = categoryPath(root, category);
      await fs.mkdir(directory, { recursive: true });
      const files = await fs.readdir(directory).catch(() => []);
      await Promise.all(files
        .filter(filename => filename.includes('.tmp-'))
        .map(filename => fs.rm(path.join(directory, filename), { force: true })));
    }
    return status();
  }

  async function listCategory(category) {
    const directory = categoryPath(root, category);
    const files = (await fs.readdir(directory).catch(() => []))
      .filter(filename => filename.toLowerCase().endsWith('.json'))
      .sort((left, right) => left.localeCompare(right, 'en'));
    const entries = [];
    const warnings = [];
    for (const filename of files) {
      try {
        const json = await fs.readFile(path.join(directory, filename), 'utf8');
        const parsed = safeJsonObject(json);
        entries.push(entryFrom(category, filename, json, parsed));
      } catch (error) {
        warnings.push(Object.freeze({
          category,
          key: filename,
          error: error?.message || 'PRESET_REPOSITORY_READ_FAILED'
        }));
      }
    }
    return { entries: Object.freeze(entries), warnings: Object.freeze(warnings) };
  }

  async function list() {
    await initialize();
    const [user, recovered] = await Promise.all([
      listCategory('user'),
      listCategory('recovered')
    ]);
    return Object.freeze({
      contract: CONTRACT,
      version: VERSION,
      root,
      categories: Object.freeze({
        builtIn: Object.freeze([]),
        user: user.entries,
        recovered: recovered.entries
      }),
      warnings: Object.freeze([...user.warnings, ...recovered.warnings])
    });
  }

  async function save(category, json, requestedFilename = '') {
    await initialize();
    const parsed = safeJsonObject(json);
    const filename = safeFilename(
      requestedFilename || parsed.id || parsed.name || 'preset'
    );
    const directory = categoryPath(root, category);
    const target = path.join(directory, filename);
    const temporary = path.join(
      directory,
      `${filename}.tmp-${process.pid}-${++temporarySerial}`
    );
    try {
      await fs.writeFile(temporary, json, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, target);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return entryFrom(category, filename, json, parsed);
  }

  async function read(category, key) {
    await initialize();
    const filename = safeFilename(path.basename(String(key || '')));
    if (filename !== String(key || '')) {
      throw new Error('PRESET_REPOSITORY_KEY_INVALID');
    }
    const json = await fs.readFile(
      path.join(categoryPath(root, category), filename),
      'utf8'
    );
    const parsed = safeJsonObject(json);
    return Object.freeze({
      ok: true,
      entry: entryFrom(category, filename, json, parsed),
      json
    });
  }

  async function remove(category, key) {
    if (category !== 'user') {
      throw new Error('PRESET_REPOSITORY_ENTRY_READ_ONLY');
    }
    const filename = safeFilename(path.basename(String(key || '')));
    if (filename !== String(key || '')) {
      throw new Error('PRESET_REPOSITORY_KEY_INVALID');
    }
    await fs.rm(path.join(categoryPath(root, category), filename), {
      force: false
    });
    return Object.freeze({ ok: true, category, key: filename });
  }

  function status() {
    return Object.freeze({
      contract: CONTRACT,
      version: VERSION,
      root,
      categories: Object.freeze(['builtIn', 'user', 'recovered']),
      maxJsonBytes: MAX_JSON_BYTES
    });
  }

  return Object.freeze({ initialize, list, save, read, remove, status });
}

module.exports = Object.freeze({
  CONTRACT,
  VERSION,
  MAX_JSON_BYTES,
  safeFilename,
  createRepository
});
