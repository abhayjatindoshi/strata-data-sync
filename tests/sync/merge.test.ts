import { describe, it, expect } from 'vitest';
import type { Hlc } from '@strata/hlc';
import { serialize } from '@strata/persistence';
import { mergePartition, diffEntityMaps } from '@strata/sync';

function makeBlob(
  entityName: string,
  entities: Record<string, unknown>,
  tombstones: Record<string, Hlc> = {},
): Uint8Array {
  return serialize({
    [entityName]: entities,
    deleted: { [entityName]: tombstones },
  });
}

const entityName = 'task';

describe('diffEntityMaps', () => {
  it('identifies local-only entities', () => {
    const result = diffEntityMaps({ a: {}, b: {} }, {}, {}, {});

    expect(result.localOnly).toContain('a');
    expect(result.localOnly).toContain('b');
    expect(result.cloudOnly).toHaveLength(0);
    expect(result.both).toHaveLength(0);
  });

  it('identifies cloud-only entities', () => {
    const result = diffEntityMaps({}, {}, { c: {} }, {});

    expect(result.cloudOnly).toContain('c');
    expect(result.localOnly).toHaveLength(0);
    expect(result.both).toHaveLength(0);
  });

  it('identifies entities present on both sides', () => {
    const result = diffEntityMaps({ a: {} }, {}, { a: {} }, {});

    expect(result.both).toContain('a');
    expect(result.localOnly).toHaveLength(0);
    expect(result.cloudOnly).toHaveLength(0);
  });

  it('accounts for tombstone presence on either side', () => {
    const result = diffEntityMaps(
      { a: {} },
      { b: { timestamp: 1, counter: 0, nodeId: 'n' } },
      {},
      { a: { timestamp: 1, counter: 0, nodeId: 'n' } },
    );

    expect(result.both).toContain('a');
    expect(result.localOnly).toContain('b');
    expect(result.cloudOnly).toHaveLength(0);
  });

  it('returns all empty for empty inputs', () => {
    const result = diffEntityMaps({}, {}, {}, {});

    expect(result.localOnly).toHaveLength(0);
    expect(result.cloudOnly).toHaveLength(0);
    expect(result.both).toHaveLength(0);
  });
});

describe('mergePartition', () => {
  it('includes local-only entities in merged result', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {});

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeDefined();
    expect(Object.keys(result.tombstones)).toHaveLength(0);
  });

  it('includes cloud-only entities in merged result', () => {
    const local = makeBlob(entityName, {});
    const cloud = makeBlob(entityName, {
      'task._.b': { id: 'task._.b', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.b']).toBeDefined();
  });

  it('resolves conflicting entities by HLC — higher timestamp wins', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'local', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'cloud', hlc: { timestamp: 2000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);
    const merged = result.entities['task._.a'] as Record<string, unknown>;

    expect(merged['value']).toBe('cloud');
  });

  it('resolves entity vs tombstone — tombstone wins when more recent', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 2000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeUndefined();
    expect(result.tombstones['task._.a']).toBeDefined();
  });

  it('resolves entity vs tombstone — entity wins when more recent', () => {
    const local = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 3000, counter: 0, nodeId: 'n1' } },
    });
    const cloud = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 2000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeDefined();
    expect(result.tombstones['task._.a']).toBeUndefined();
  });

  it('resolves cloud entity vs local tombstone — tombstone wins', () => {
    const local = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 3000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', hlc: { timestamp: 1000, counter: 0, nodeId: 'n2' } },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.entities['task._.a']).toBeUndefined();
    expect(result.tombstones['task._.a']).toBeDefined();
  });

  it('resolves two tombstones — keeps higher HLC', () => {
    const local = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {}, {
      'task._.a': { timestamp: 2000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.tombstones['task._.a'].timestamp).toBe(2000);
  });

  it('produces identical merged result regardless of local/cloud order', () => {
    const sideA = makeBlob(entityName, {
      'task._.a': { id: 'task._.a', value: 'A', hlc: { timestamp: 1000, counter: 0, nodeId: 'n1' } },
      'task._.b': { id: 'task._.b', value: 'B-A', hlc: { timestamp: 2000, counter: 0, nodeId: 'n1' } },
    });
    const sideB = makeBlob(entityName, {
      'task._.b': { id: 'task._.b', value: 'B-B', hlc: { timestamp: 3000, counter: 0, nodeId: 'n2' } },
      'task._.c': { id: 'task._.c', value: 'C', hlc: { timestamp: 1000, counter: 0, nodeId: 'n2' } },
    });

    const resultAB = mergePartition(sideA, sideB, entityName);
    const resultBA = mergePartition(sideB, sideA, entityName);

    expect(Object.keys(resultAB.entities).sort()).toEqual(
      Object.keys(resultBA.entities).sort(),
    );

    const entityB_AB = resultAB.entities['task._.b'] as Record<string, unknown>;
    const entityB_BA = resultBA.entities['task._.b'] as Record<string, unknown>;
    expect(entityB_AB['value']).toBe('B-B');
    expect(entityB_BA['value']).toBe('B-B');
  });

  it('handles entries present on both sides with null values', () => {
    // Construct blobs where an ID exists with null value on both sides
    const local = makeBlob(entityName, {
      'task._.x': null,
    });
    const cloud = makeBlob(entityName, {
      'task._.x': null,
    });

    const result = mergePartition(local, cloud, entityName);

    // The null-null case reaches the fallback return {} — no entity or tombstone
    expect(result.entities['task._.x']).toBeUndefined();
    expect(result.tombstones['task._.x']).toBeUndefined();
  });

  it('handles cloud-only tombstones', () => {
    const local = makeBlob(entityName, {});
    const cloud = makeBlob(entityName, {}, {
      'task._.deleted': { timestamp: 1000, counter: 0, nodeId: 'n2' },
    });

    const result = mergePartition(local, cloud, entityName);

    expect(result.tombstones['task._.deleted']).toBeDefined();
    expect(Object.keys(result.entities)).toHaveLength(0);
  });

  it('handles local-only tombstones', () => {
    const local = makeBlob(entityName, {}, {
      'task._.deleted': { timestamp: 1000, counter: 0, nodeId: 'n1' },
    });
    const cloud = makeBlob(entityName, {});

    const result = mergePartition(local, cloud, entityName);

    expect(result.tombstones['task._.deleted']).toBeDefined();
    expect(Object.keys(result.entities)).toHaveLength(0);
  });
});
