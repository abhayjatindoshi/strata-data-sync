import { describe, it, expect } from 'vitest';
import { MemoryBlobAdapter } from '../adapter/index.js';
import type { Tenant } from './types.js';
import {
  readTenantList,
  writeTenantList,
  unionMergeTenantLists,
  writeMarkerBlob,
  readMarkerBlob,
} from './tenant-storage.js';

function makeTenant(id: string, updatedAt: Date = new Date()): Tenant {
  return {
    id,
    name: `Tenant ${id}`,
    cloudMeta: { bucket: `bucket-${id}` },
    createdAt: new Date('2025-01-01'),
    updatedAt,
  };
}

describe('tenant storage', () => {
  describe('readTenantList / writeTenantList', () => {
    it('returns empty array when no blob exists', async () => {
      const adapter = new MemoryBlobAdapter();
      const result = await readTenantList(adapter, undefined);
      expect(result).toEqual([]);
    });

    it('round-trips tenant list', async () => {
      const adapter = new MemoryBlobAdapter();
      const tenants = [makeTenant('t1'), makeTenant('t2')];

      await writeTenantList(adapter, undefined, tenants);
      const result = await readTenantList(adapter, undefined);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('t1');
      expect(result[1]?.id).toBe('t2');
      expect(result[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('preserves optional fields', async () => {
      const adapter = new MemoryBlobAdapter();
      const tenant: Tenant = {
        ...makeTenant('t1'),
        icon: '🏢',
        color: '#ff0000',
      };
      await writeTenantList(adapter, undefined, [tenant]);
      const result = await readTenantList(adapter, undefined);
      expect(result[0]?.icon).toBe('🏢');
      expect(result[0]?.color).toBe('#ff0000');
    });
  });

  describe('unionMergeTenantLists', () => {
    it('merges two non-overlapping lists', () => {
      const local = [makeTenant('t1')];
      const cloud = [makeTenant('t2')];
      const result = unionMergeTenantLists(local, cloud);
      expect(result).toHaveLength(2);
    });

    it('keeps newer updatedAt on conflict', () => {
      const older = makeTenant('t1', new Date('2025-01-01'));
      const newer = makeTenant('t1', new Date('2025-06-01'));
      const result = unionMergeTenantLists([older], [newer]);
      expect(result).toHaveLength(1);
      expect(result[0]?.updatedAt).toEqual(new Date('2025-06-01'));
    });

    it('keeps local when cloud is older', () => {
      const newer = makeTenant('t1', new Date('2025-06-01'));
      const older = makeTenant('t1', new Date('2025-01-01'));
      const result = unionMergeTenantLists([newer], [older]);
      expect(result).toHaveLength(1);
      expect(result[0]?.updatedAt).toEqual(new Date('2025-06-01'));
    });
  });

  describe('marker blob', () => {
    it('writes and reads marker blob', async () => {
      const adapter = new MemoryBlobAdapter();
      const meta = { bucket: 'test' };

      expect(await readMarkerBlob(adapter, meta)).toBe(false);
      await writeMarkerBlob(adapter, meta);
      expect(await readMarkerBlob(adapter, meta)).toBe(true);
    });
  });
});
