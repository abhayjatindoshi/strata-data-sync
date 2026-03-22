export type SyncScheduler = {
  readonly schedule: (fn: () => Promise<void>) => Promise<void>;
  readonly dispose: () => void;
};

export type PartitionDiff = {
  readonly added: ReadonlyArray<string>;
  readonly removed: ReadonlyArray<string>;
  readonly changed: ReadonlyArray<string>;
  readonly unchanged: ReadonlyArray<string>;
};

export type FlushMechanism = {
  readonly markDirty: (entityKey: string) => void;
  readonly flush: () => Promise<void>;
  readonly dispose: () => Promise<void>;
};
