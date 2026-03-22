import type { BaseEntity, DeriveIdFn } from '../entity/index.js';
import type { KeyStrategy } from '../key-strategy/index.js';
import { global as globalStrategy } from '../key-strategy/index.js';
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
