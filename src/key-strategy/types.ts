export type KeyStrategyType = 'singleton' | 'global' | 'partitioned';

export type KeyStrategy<T = unknown> = {
  readonly type: KeyStrategyType;
  readonly getPartitionKey: (entity: T) => string;
};
