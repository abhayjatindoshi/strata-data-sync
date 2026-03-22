import { useMemo } from 'react';
import type { BaseEntity } from '../entity/index.js';
import type { EntityDefinition } from '../schema/index.js';
import type { Repository, SingletonRepository } from '../repository/index.js';
import { useStrata } from './strata-provider.js';

export function useRepo<T extends BaseEntity>(
  def: EntityDefinition<T>,
): Repository<T> | SingletonRepository<T> {
  const strata = useStrata();
  return useMemo(() => strata.repo(def), [strata, def]);
}
