import { describe, it, expect } from 'vitest';
import { createMemoryBlobAdapter } from '@strata/adapter';
import { STRATA_MARKER_KEY } from '@strata/adapter';
import { writeMarkerBlob, readMarkerBlob, validateMarkerBlob } from '@strata/tenant';

describe('writeMarkerBlob / readMarkerBlob', () => {
  it('round-trips marker blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const cloudMeta = { folder: 'test' };
    await writeMarkerBlob(adapter, cloudMeta, ['transaction', 'account']);

    const marker = await readMarkerBlob(adapter, cloudMeta);
    expect(marker).toBeDefined();
    expect(marker!.version).toBe(1);
    expect(marker!.createdAt).toBeInstanceOf(Date);
    expect(marker!.entityTypes).toEqual(['transaction', 'account']);
  });

  it('returns undefined for missing blob', async () => {
    const adapter = createMemoryBlobAdapter();
    const result = await readMarkerBlob(adapter, { folder: 'missing' });
    expect(result).toBeUndefined();
  });

  it('persists entity types array correctly', async () => {
    const adapter = createMemoryBlobAdapter();
    await writeMarkerBlob(adapter, { bucket: 'x' }, ['user', 'post', 'comment']);

    const marker = await readMarkerBlob(adapter, { bucket: 'x' });
    expect(marker!.entityTypes).toEqual(['user', 'post', 'comment']);
  });

  it('writes to __strata key', async () => {
    const adapter = createMemoryBlobAdapter();
    await writeMarkerBlob(adapter, { f: '1' }, []);

    const data = await adapter.read({ f: '1' }, STRATA_MARKER_KEY);
    expect(data).not.toBeNull();
  });

  it('persists empty entity types array', async () => {
    const adapter = createMemoryBlobAdapter();
    await writeMarkerBlob(adapter, {}, []);

    const marker = await readMarkerBlob(adapter, {});
    expect(marker!.entityTypes).toEqual([]);
  });
});

describe('validateMarkerBlob', () => {
  it('accepts version 1', () => {
    expect(validateMarkerBlob({ version: 1, createdAt: new Date(), entityTypes: [] })).toBe(true);
  });

  it('rejects version 0', () => {
    expect(validateMarkerBlob({ version: 0, createdAt: new Date(), entityTypes: [] })).toBe(false);
  });

  it('rejects version 2', () => {
    expect(validateMarkerBlob({ version: 2, createdAt: new Date(), entityTypes: [] })).toBe(false);
  });

  it('rejects negative version', () => {
    expect(validateMarkerBlob({ version: -1, createdAt: new Date(), entityTypes: [] })).toBe(false);
  });
});
