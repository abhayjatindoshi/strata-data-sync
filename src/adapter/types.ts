export type CloudMeta = Readonly<Record<string, unknown>> | undefined;

export type BlobAdapter = {
  read(cloudMeta: CloudMeta, key: string): Promise<Uint8Array | null>;
  write(cloudMeta: CloudMeta, key: string, data: Uint8Array): Promise<void>;
  delete(cloudMeta: CloudMeta, key: string): Promise<boolean>;
  list(cloudMeta: CloudMeta, prefix: string): Promise<string[]>;
};
