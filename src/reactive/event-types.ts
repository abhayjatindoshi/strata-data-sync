export type EntityEventType = 'created' | 'updated' | 'deleted';

export type EntityEvent = {
  readonly type: EntityEventType;
  readonly entityName: string;
  readonly partitionKey: string;
  readonly entityId: string;
  readonly entity: Readonly<Record<string, unknown>> | undefined;
};

export type EntityEventListener = (event: EntityEvent) => void;
