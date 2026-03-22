import type { BaseEntity } from '../entity/index.js';
import type { QueryOptions, WhereClause, OrderByClause } from './types.js';

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return 0;
}

function matchClause<T>(entity: T, clause: WhereClause<T>): boolean {
  const fieldValue: unknown = entity[clause.field];
  const { value, op } = clause;
  if (op === '==') return fieldValue === value;
  if (op === '!=') return fieldValue !== value;
  if (op === 'in') return Array.isArray(value) && value.includes(fieldValue);
  const cmp = compareValues(fieldValue, value);
  if (op === '<') return cmp < 0;
  if (op === '<=') return cmp <= 0;
  if (op === '>') return cmp > 0;
  return cmp >= 0;
}

function applyWhere<T extends BaseEntity>(
  entities: ReadonlyArray<T>,
  clauses: ReadonlyArray<WhereClause<T>>,
): ReadonlyArray<T> {
  return entities.filter(e => clauses.every(c => matchClause(e, c)));
}

function sortCompare<T>(
  a: T,
  b: T,
  clauses: ReadonlyArray<OrderByClause<T>>,
): number {
  for (const { field, direction } of clauses) {
    const cmp = compareValues(a[field], b[field]);
    if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
  }
  return 0;
}

function applyOrderBy<T extends BaseEntity>(
  entities: ReadonlyArray<T>,
  clauses: ReadonlyArray<OrderByClause<T>>,
): ReadonlyArray<T> {
  return [...entities].sort((a, b) => sortCompare(a, b, clauses));
}

export function executeQuery<T extends BaseEntity>(
  entities: ReadonlyArray<T>,
  opts?: QueryOptions<T>,
): ReadonlyArray<T> {
  if (!opts) return entities;
  let result = entities;
  if (opts.where?.length) result = applyWhere(result, opts.where);
  if (opts.orderBy?.length) result = applyOrderBy(result, opts.orderBy);
  if (opts.offset !== undefined) result = result.slice(opts.offset);
  if (opts.limit !== undefined) result = result.slice(0, opts.limit);
  return result;
}
