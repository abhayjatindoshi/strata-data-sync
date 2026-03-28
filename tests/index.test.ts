import { describe, it, expect } from 'vitest';
import {
  createHlc,
  MemoryBlobAdapter,
  defineEntity,
  EventBus,
} from '@strata/index';

describe('index barrel exports', () => {
  it('exports HLC module', () => {
    expect(createHlc).toBeDefined();
  });

  it('exports adapter module', () => {
    expect(MemoryBlobAdapter).toBeDefined();
  });

  it('exports schema module', () => {
    expect(defineEntity).toBeDefined();
  });

  it('exports reactive module', () => {
    expect(EventBus).toBeDefined();
  });
});
