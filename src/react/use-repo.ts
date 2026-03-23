import { useMemo } from 'react';
import type { BaseEntity } from '@strata/entity';
import type { EntityDefinition } from '@strata/schema';
import type { Repository, SingletonRepository } from '@strata/repository';
import { useStrata } from './strata-provider.js';

export function useRepo<T extends BaseEntity>(
  def: EntityDefinition<T>,
): Repository<T> | SingletonRepository<T> {
  const strata = useStrata();
  return useMemo(() => strata.repo(def), [strata, def]);
}
