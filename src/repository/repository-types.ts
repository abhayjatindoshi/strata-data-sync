import type { BehaviorSubject } from 'rxjs';
import type { BaseEntity } from '../entity/index.js';

export type GetAllOptions = {
  readonly partitionKey?: string;
};

export type Repository<T> = {
  readonly get: (id: string) => Promise<Readonly<BaseEntity & T> | undefined>;
  readonly getAll: (options?: GetAllOptions) => Promise<ReadonlyArray<Readonly<BaseEntity & T>>>;
  readonly save: (entity: T & Partial<BaseEntity>) => Promise<string>;
  readonly delete: (id: string) => Promise<boolean>;
  readonly observe: (id: string) => BehaviorSubject<Readonly<BaseEntity & T> | undefined>;
  readonly observeAll: (options?: GetAllOptions) => BehaviorSubject<ReadonlyArray<Readonly<BaseEntity & T>>>;
};
