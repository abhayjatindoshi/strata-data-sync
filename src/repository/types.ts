import type { Observable } from 'rxjs';
import type { BaseEntity } from '@strata/entity';

export type WhereClause<T> = {
  readonly field: keyof T;
  readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';
  readonly value: unknown;
};

export type OrderByClause<T> = {
  readonly field: keyof T;
  readonly direction: 'asc' | 'desc';
};

export type QueryOptions<T> = {
  readonly where?: ReadonlyArray<WhereClause<T>>;
  readonly orderBy?: ReadonlyArray<OrderByClause<T>>;
  readonly limit?: number;
  readonly offset?: number;
};

export type Repository<T extends BaseEntity> = {
  readonly get: (id: string) => T | undefined;
  readonly query: (opts?: QueryOptions<T>) => ReadonlyArray<T>;
  readonly save: (entity: T) => void;
  readonly saveMany: (entities: ReadonlyArray<T>) => void;
  readonly delete: (id: string) => void;
  readonly deleteMany: (ids: ReadonlyArray<string>) => void;
  readonly observe: (id: string) => Observable<T | undefined>;
  readonly observeQuery: (opts?: QueryOptions<T>) => Observable<ReadonlyArray<T>>;
};

export type SingletonRepository<T extends BaseEntity> = {
  readonly get: () => T | undefined;
  readonly save: (entity: T) => void;
  readonly delete: () => void;
  readonly observe: () => Observable<T | undefined>;
};
