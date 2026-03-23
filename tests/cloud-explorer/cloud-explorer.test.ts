import { describe, it, expect } from 'vitest';
import { CloudExplorer } from '@strata/cloud-explorer/cloud-explorer.js';

describe('CloudExplorer', () => {
  it('exports CloudExplorer component', () => {
    expect(typeof CloudExplorer).toBe('function');
  });
});
