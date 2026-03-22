import type { BaseEntity, DeriveIdFn } from '../entity/index.js';
import type { KeyStrategy } from '../key-strategy/index.js';

export type EntityDefinition<T extends BaseEntity> = {
  readonly name: string;
  readonly keyStrategy: KeyStrategy<T>;
  readonly deriveId?: DeriveIdFn<T>;
};
