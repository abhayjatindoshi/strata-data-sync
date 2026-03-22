export type CloudFileService = {
  readonly listFiles: (folderId: string) => Promise<ReadonlyArray<{ id: string; name: string }>>;
  readonly readFile: (fileId: string) => Promise<Uint8Array>;
  readonly writeFile: (folderId: string, name: string, data: Uint8Array) => Promise<string>;
  readonly deleteFile: (fileId: string) => Promise<void>;
  readonly createFolder: (parentId: string, name: string) => Promise<string>;
};

export type CloudObjectService = {
  readonly listObjects: (prefix: string) => Promise<ReadonlyArray<{ key: string; size: number }>>;
  readonly getObject: (key: string) => Promise<Uint8Array>;
  readonly putObject: (key: string, data: Uint8Array) => Promise<void>;
  readonly deleteObject: (key: string) => Promise<void>;
};
