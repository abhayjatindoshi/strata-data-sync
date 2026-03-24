export type Meta = Readonly<Record<string, unknown>> | undefined;

export type BlobAdapter = {
  read(meta: Meta, key: string): Promise<Uint8Array | null>;
  write(meta: Meta, key: string, data: Uint8Array): Promise<void>;
  delete(meta: Meta, key: string): Promise<boolean>;
  list(meta: Meta, prefix: string): Promise<string[]>;
};

export type BlobTransform = {
  encode(data: Uint8Array): Promise<Uint8Array>;
  decode(data: Uint8Array): Promise<Uint8Array>;
};
