import { describe, it, expect, vi } from 'vitest';
import type { PartitionBlob } from '@strata/persistence';
import { createFlushMechanism } from '@strata/sync/flush.js';

const emptyBlob: PartitionBlob = { entities: {}, deleted: {} };

describe('createFlushMechanism', () => {
  it('flushes dirty partitions', async () => {
    const getBlob = vi.fn().mockReturnValue(emptyBlob);
    const writeBlob = vi.fn().mockResolvedValue(undefined);
    const flush = createFlushMechanism(getBlob, writeBlob);

    flush.markDirty('task._');
    await flush.flush();

    expect(getBlob).toHaveBeenCalledWith('task._');
    expect(writeBlob).toHaveBeenCalledWith('task._', emptyBlob);
  });

  it('flushes multiple dirty keys', async () => {
    const getBlob = vi.fn().mockReturnValue(emptyBlob);
    const writeBlob = vi.fn().mockResolvedValue(undefined);
    const flush = createFlushMechanism(getBlob, writeBlob);

    flush.markDirty('task._');
    flush.markDirty('note._');
    await flush.flush();

    expect(writeBlob).toHaveBeenCalledTimes(2);
  });

  it('deduplicates dirty keys', async () => {
    const getBlob = vi.fn().mockReturnValue(emptyBlob);
    const writeBlob = vi.fn().mockResolvedValue(undefined);
    const flush = createFlushMechanism(getBlob, writeBlob);

    flush.markDirty('task._');
    flush.markDirty('task._');
    await flush.flush();

    expect(writeBlob).toHaveBeenCalledTimes(1);
  });

  it('clears dirty set after flush', async () => {
    const getBlob = vi.fn().mockReturnValue(emptyBlob);
    const writeBlob = vi.fn().mockResolvedValue(undefined);
    const flush = createFlushMechanism(getBlob, writeBlob);

    flush.markDirty('task._');
    await flush.flush();
    writeBlob.mockClear();

    await flush.flush();
    expect(writeBlob).not.toHaveBeenCalled();
  });

  it('dispose triggers final flush', async () => {
    const getBlob = vi.fn().mockReturnValue(emptyBlob);
    const writeBlob = vi.fn().mockResolvedValue(undefined);
    const flush = createFlushMechanism(getBlob, writeBlob);

    flush.markDirty('task._');
    await flush.dispose();

    expect(writeBlob).toHaveBeenCalledTimes(1);
  });
});
