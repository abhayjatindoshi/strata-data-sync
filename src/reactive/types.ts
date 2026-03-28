export type EntityEvent = {
  readonly entityName: string;
  readonly fromSync?: boolean;
};

export type EntityEventListener = (event: EntityEvent) => void;

export type EntityEventBus = {
  on(listener: EntityEventListener): void;
  off(listener: EntityEventListener): void;
  emit(event: EntityEvent): void;
};
