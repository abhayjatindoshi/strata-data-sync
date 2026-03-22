import type { Observable } from 'rxjs';
import type { BlobAdapter } from '../adapter/index.js';
import type { BaseEntity } from '../entity/index.js';
import type { EntityDefinition } from '../schema/index.js';
import type { Repository, SingletonRepository } from '../repository/index.js';
import type { TenantManager } from '../tenant/index.js';

export type StrataConfig = {
  readonly entities: ReadonlyArray<EntityDefinition<any>>;
  readonly localAdapter: BlobAdapter;
  readonly cloudAdapter?: BlobAdapter;
  readonly nodeId: string;
  readonly flushIntervalMs?: number;
  readonly syncIntervalMs?: number;
  readonly tombstoneRetentionDays?: number;
  readonly deriveTenantId?: (cloudMeta: Readonly<Record<string, unknown>>) => string;
};

export type Strata = {
  readonly repo: <T extends BaseEntity>(def: EntityDefinition<T>) =>
    Repository<T> | SingletonRepository<T>;
  readonly tenants: TenantManager;
  readonly sync: () => Promise<void>;
  readonly isDirty: boolean;
  readonly isDirty$: Observable<boolean>;
  readonly dispose: () => Promise<void>;
};
