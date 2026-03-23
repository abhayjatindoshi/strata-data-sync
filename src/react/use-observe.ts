import { useState, useEffect, useMemo } from 'react';
import type { Observable } from 'rxjs';
import type { BaseEntity } from '@strata/entity';
import type { Repository, QueryOptions } from '@strata/repository';

export function useObserve<T extends BaseEntity>(
  repo: Repository<T>,
  id: string,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(() => repo.get(id));

  useEffect(() => {
    // Sync initial value for the new id
    setValue(repo.get(id));

    const sub = repo.observe(id).subscribe((v) => setValue(v));
    return () => sub.unsubscribe();
  }, [repo, id]);

  return value;
}

export function useQuery<T extends BaseEntity>(
  repo: Repository<T>,
  opts?: QueryOptions<T>,
): ReadonlyArray<T> {
  // Memoize opts by serialized value to avoid re-subscribing on every render
  const serialized = JSON.stringify(opts);
  const stableOpts = useMemo(() => opts, [serialized]);

  const [value, setValue] = useState<ReadonlyArray<T>>(() => repo.query(stableOpts));

  useEffect(() => {
    setValue(repo.query(stableOpts));

    const observable: Observable<ReadonlyArray<T>> = repo.observeQuery(stableOpts);
    const sub = observable.subscribe((v) => setValue(v));
    return () => sub.unsubscribe();
  }, [repo, stableOpts]);

  return value;
}
