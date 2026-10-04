import { expect, it } from 'vitest';
import { normalizeExportSettings, shouldFlushBatch } from '../src/export-settings';
it('bounds output batches and validates quality', () => {
  const settings = normalizeExportSettings({ quality: 'invalid', batchFiles: 0, batchBytes: -1 });
  expect(settings.quality).toBe('high'); expect(settings.batchBytes).toBe(8 * 1048576);
  expect(normalizeExportSettings({quality:'__proto__'}).quality).toBe('high');
  expect(shouldFlushBatch(0, 0, 1e9, settings)).toBe(false);
  expect(shouldFlushBatch(1, 1, 1e9, settings)).toBe(true);
  expect(shouldFlushBatch(1, 10, 1, normalizeExportSettings(null))).toBe(true);
});
