export type SortDirection = 'asc' | 'desc';

export type OrderByClause<T> = {
  readonly field: keyof T;
  readonly direction: SortDirection;
};

export type QueryOptions<T> = {
  readonly ids?: readonly string[];
  readonly where?: Partial<T>;
  readonly orderBy?: readonly OrderByClause<T>[];
};

export function applyQuery<T extends { readonly id: string }>(
  entities: ReadonlyArray<T>,
  options?: QueryOptions<T>,
): ReadonlyArray<T> {
  if (!options) return entities;

  let result: T[] = [...entities];

  if (options.ids && options.ids.length > 0) {
    const idSet = new Set(options.ids);
    result = result.filter((e) => idSet.has(e.id));
  }

  if (options.where) {
    const criteria = options.where;
    result = result.filter((entity) => {
      for (const key of Object.keys(criteria) as Array<keyof T>) {
        if (entity[key] !== criteria[key]) return false;
      }
      return true;
    });
  }

  if (options.orderBy && options.orderBy.length > 0) {
    const clauses = options.orderBy;
    result.sort((a, b) => {
      for (const clause of clauses) {
        const aVal = a[clause.field];
        const bVal = b[clause.field];
        const cmp = compareValues(aVal, bVal);
        if (cmp !== 0) return clause.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  return result;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;

  return String(a).localeCompare(String(b));
}
