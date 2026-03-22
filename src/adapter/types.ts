export type CloudMeta = Readonly<Record<string, unknown>> | undefined;

export type BlobAdapter = {
  read(cloudMeta: CloudMeta, path: string): Promise<Uint8Array | null>;
  write(cloudMeta: CloudMeta, path: string, data: Uint8Array): Promise<void>;
  delete(cloudMeta: CloudMeta, path: string): Promise<void>;
  list(cloudMeta: CloudMeta, prefix: string): Promise<string[]>;
};
