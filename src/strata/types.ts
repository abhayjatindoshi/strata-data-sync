import type { Observable } from 'rxjs';
import type { BlobAdapter } from '@strata/adapter';
import type { BaseEntity } from '@strata/entity';
import type { EntityDefinition } from '@strata/schema';
import type { Repository, SingletonRepository } from '@strata/repository';
import type { TenantManager } from '@strata/tenant';

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
