export type EntityEventSource = 'user' | 'sync';

export type EntityEvent = {
  readonly entityName: string;
  readonly source: EntityEventSource;
  readonly updates: ReadonlyArray<string>;
  readonly deletes: ReadonlyArray<string>;
};
