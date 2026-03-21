import type { BehaviorSubject } from 'rxjs';
import type { BaseEntity } from '../entity/index.js';
import type { QueryOptions } from '../store/index.js';

export type GetAllOptions<T = Record<string, unknown>> = {
  readonly partitionKey?: string;
} & QueryOptions<BaseEntity & T>;

export type Repository<T> = {
  readonly get: (id: string) => Promise<Readonly<BaseEntity & T> | undefined>;
  readonly getAll: (options?: GetAllOptions<T>) => Promise<ReadonlyArray<Readonly<BaseEntity & T>>>;
  readonly save: (entity: T & Partial<BaseEntity>) => Promise<string>;
  readonly delete: (id: string) => Promise<boolean>;
  readonly observe: (id: string) => BehaviorSubject<Readonly<BaseEntity & T> | undefined>;
  readonly observeAll: (options?: GetAllOptions<T>) => BehaviorSubject<ReadonlyArray<Readonly<BaseEntity & T>>>;
};
