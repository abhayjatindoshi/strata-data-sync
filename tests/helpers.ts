import { resolveOptions } from '@strata/options';
import type { ResolvedStrataOptions } from '@strata/options';
import { MemoryStorageAdapter, noopEncryptionService } from '@strata/adapter';
import type { StorageAdapter } from '@strata/adapter';
import { EncryptedDataAdapter } from '@strata/persistence';
import type { DataAdapter } from '@strata/persistence';
import { TenantContext } from '@strata/tenant';

export const DEFAULT_OPTIONS: ResolvedStrataOptions = resolveOptions();

const sharedContext = new TenantContext();

export function createDataAdapter(): DataAdapter {
  return new EncryptedDataAdapter(new MemoryStorageAdapter(), noopEncryptionService, sharedContext);
}

export function wrapAdapter(adapter: StorageAdapter): DataAdapter {
  return new EncryptedDataAdapter(adapter, noopEncryptionService, sharedContext);
}



