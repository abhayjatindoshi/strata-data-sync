import { useMemo } from 'react';
import type { EntityDef } from '@strata/schema';
import type { Repository } from '@strata/repository';
import { useStrataContext } from './strata-context';

export function useRepo<TName extends string, TFields>(
  def: EntityDef<TName, TFields>,
): Repository<TFields> {
  const strata = useStrataContext();
  return useMemo(() => strata.repo(def), [strata, def]);
}
