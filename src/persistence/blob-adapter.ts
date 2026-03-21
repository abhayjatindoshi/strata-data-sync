export type BlobAdapter = {
  readonly read: (key: string) => Promise<Uint8Array | null>;
  readonly write: (key: string, data: Uint8Array) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly list: (prefix: string) => Promise<readonly string[]>;
};
