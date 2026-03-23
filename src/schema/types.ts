import type { BaseEntity, DeriveIdFn } from '@strata/entity';
import type { KeyStrategy } from '@strata/key-strategy';

export type EntityDefinition<T extends BaseEntity> = {
  readonly name: string;
  readonly keyStrategy: KeyStrategy<T>;
  readonly deriveId?: DeriveIdFn<T>;
};
