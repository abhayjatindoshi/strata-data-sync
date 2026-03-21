import type { EntityDef } from '../schema/index.js';
import type { KeyStrategy } from '../key-strategy/index.js';
import type { BlobAdapter } from '../persistence/index.js';
import type { Repository } from '../repository/index.js';
import type { TenantManager } from '../tenant/index.js';

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
