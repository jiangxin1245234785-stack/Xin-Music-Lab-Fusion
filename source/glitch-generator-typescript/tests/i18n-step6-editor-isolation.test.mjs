import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_SCHEMA_VERSION,
  FixedStepEngineClock,
  UndoHistory,
  getProductBuiltInPreset,
  loadPreset,
  loadPresetFromStorage,
  savePresetToStorage
} from '../dist/index.js';
import {
  createLocaleController,
  translateSurfaceText
} from '../dist/ui/i18n/index.js';
import {
  createMappingIntentViewModel
} from '../dist/ui/presenters/index.js';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  rawValue() {
    assert.equal(this.values.size, 1);
    return [...this.values.values()][0];
  }
}

function hasLocaleKey(value) {
  if (Array.isArray(value)) return value.some(hasLocaleKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) =>
    /^(?:locale|language|lang)$/i.test(key) || hasLocaleKey(child)
  );
}

test('Step 6 locale changes leave saved and reloaded Preset JSON byte-identical', () => {
  const locale = createLocaleController();
  const preset = loadPreset(getProductBuiltInPreset('temporal-excavation'));
  const presetBefore = JSON.stringify(preset);
  const saveAtCurrentLocale = () => {
    const storage = new MemoryStorage();
    translateSurfaceText(locale.getLocale(), 'PRESET SAVED');
    const saved = savePresetToStorage(storage, preset);
    const raw = storage.rawValue();
    const loaded = loadPresetFromStorage(storage);
    assert.deepEqual(loaded, saved);
    assert.equal(saved.schemaVersion, CURRENT_SCHEMA_VERSION);
    return { raw, saved, loaded };
  };

  const defaultChinese = saveAtCurrentLocale();
  locale.setLocalLocale('en-US');
  const localEnglish = saveAtCurrentLocale();
  locale.setHostLocale('zh-CN');
  const hostChinese = saveAtCurrentLocale();
  locale.clearHostLocale();
  const restoredEnglish = saveAtCurrentLocale();

  assert.equal(localEnglish.raw, defaultChinese.raw);
  assert.equal(hostChinese.raw, defaultChinese.raw);
  assert.equal(restoredEnglish.raw, defaultChinese.raw);
  assert.deepEqual(localEnglish.saved, defaultChinese.saved);
  assert.deepEqual(hostChinese.loaded, defaultChinese.loaded);
  assert.equal(hasLocaleKey(JSON.parse(defaultChinese.raw)), false);
  assert.equal(JSON.stringify(preset), presetBefore);
});

test('Step 6 locale presentation never enters UndoHistory and Undo/Redo restores exact editor state', () => {
  const preset = loadPreset(getProductBuiltInPreset('balanced'));
  const mappingIndex = 0;
  const before = {
    preset,
    selectedMappingId: preset.mappings[mappingIndex].id,
    amount: preset.mappings[mappingIndex].amount
  };
  const after = structuredClone(before);
  after.amount += 0.37;
  after.preset.mappings[mappingIndex].amount = after.amount;
  const history = new UndoHistory({
    clone: state => structuredClone(state),
    limit: 20
  });
  const clock = new FixedStepEngineClock(16);
  const transactionClock = clock.tick();
  const transaction = history.recordDiscrete(
    'Change Mapping amount',
    before,
    after,
    transactionClock.nowMs
  );
  const locale = createLocaleController();
  let current = structuredClone(after);
  const renderIntent = () => createMappingIntentViewModel({
    mapping: current.preset.mappings[mappingIndex],
    translator: locale,
    locale: locale.getLocale()
  });
  const unsubscribe = locale.subscribe(renderIntent);
  const historyBeforeLocale = {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    activeContinuousKey: history.activeContinuousKey
  };

  locale.setLocalLocale('en-US');
  renderIntent();
  locale.setHostLocale('zh-CN');
  renderIntent();
  locale.clearHostLocale();
  assert.deepEqual({
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    activeContinuousKey: history.activeContinuousKey
  }, historyBeforeLocale);

  const undone = history.undo();
  assert.deepEqual(undone.state, before);
  assert.equal(undone.transaction.sequence, transaction.sequence);
  assert.equal(undone.transaction.engineTimeMs, transactionClock.nowMs);
  current = undone.state;
  locale.setLocalLocale('zh-CN');
  renderIntent();

  const redone = history.redo();
  assert.deepEqual(redone.state, after);
  assert.equal(redone.transaction.sequence, transaction.sequence);
  assert.equal(redone.transaction.engineTimeMs, transactionClock.nowMs);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);
  assert.equal(clock.tick().frameIndex, transactionClock.frameIndex + 1);
  unsubscribe();
});
