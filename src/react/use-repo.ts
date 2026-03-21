import { useMemo } from 'react';
import type { EntityDef } from '../schema/index.js';
import type { Repository } from '../repository/index.js';
import { useStrataContext } from './strata-context.js';

export function useRepo<TName extends string, TFields>(
  def: EntityDef<TName, TFields>,
): Repository<TFields> {
  const strata = useStrataContext();
  return useMemo(() => strata.repo(def), [strata, def]);
}
