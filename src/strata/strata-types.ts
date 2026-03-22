import type { EntityDef } from '@strata/schema';
import type { KeyStrategy } from '@strata/key-strategy';
import type { BlobAdapter } from '@strata/persistence';
import type { Repository } from '@strata/repository';
import type { TenantManager } from '@strata/tenant';

export type StrataConfig = {
  readonly entities: ReadonlyArray<EntityDef<string, unknown>>;
  readonly localAdapter: BlobAdapter;
  readonly cloudAdapter?: BlobAdapter;
  readonly keyStrategy: KeyStrategy;
  readonly deviceId: string;
};

export type Strata = {
  readonly repo: <TName extends string, TFields>(
    def: EntityDef<TName, TFields>,
  ) => Repository<TFields>;
  readonly load: (tenantId: string) => Promise<void>;
  readonly tenants: TenantManager;
  readonly sync: () => void;
  readonly dispose: () => void;
};
