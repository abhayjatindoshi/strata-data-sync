import type { BaseEntity } from '@strata/schema';

export type QueryOptions<T> = {
  readonly where?: Partial<T>;
  readonly range?: {
    readonly field: keyof T;
    readonly gt?: unknown;
    readonly gte?: unknown;
    readonly lt?: unknown;
    readonly lte?: unknown;
  };
  readonly orderBy?: ReadonlyArray<{
    readonly field: keyof T;
    readonly direction: 'asc' | 'desc';
  }>;
  readonly limit?: number;
  readonly offset?: number;
};

export type Repository<T> = {
  get(id: string): (T & BaseEntity) | undefined;
  query(opts?: QueryOptions<T>): ReadonlyArray<T & BaseEntity>;
  save(entity: T & Partial<BaseEntity>): string;
  saveMany(entities: ReadonlyArray<T & Partial<BaseEntity>>): ReadonlyArray<string>;
  delete(id: string): boolean;
  deleteMany(ids: ReadonlyArray<string>): void;
};
