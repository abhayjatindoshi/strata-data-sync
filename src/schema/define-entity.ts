import type { BaseEntity, DeriveIdFn } from '@strata/entity';
import type { KeyStrategy } from '@strata/key-strategy';
import { global as globalStrategy } from '@strata/key-strategy';
import type { EntityDefinition } from './types.js';

export function defineEntity<T extends BaseEntity>(
  name: string,
  opts?: {
    readonly keyStrategy?: KeyStrategy<T>;
    readonly deriveId?: DeriveIdFn<T>;
  },
): EntityDefinition<T> {
  return {
    name,
    keyStrategy: opts?.keyStrategy ?? (globalStrategy as KeyStrategy<T>),
    deriveId: opts?.deriveId,
  };
}
