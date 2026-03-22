export type ExplorerItem = {
  readonly id: string;
  readonly name: string;
  readonly type: 'container' | 'item';
  readonly path: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly claimed?: boolean;
};

export type ExplorerCapabilities = {
  readonly canCreateContainer: boolean;
  readonly canSelect: boolean;
};

export type ExplorerDataSource = {
  readonly getSpaces: () => Promise<ReadonlyArray<ExplorerItem>>;
  readonly getItems: (parentId: string) => Promise<ReadonlyArray<ExplorerItem>>;
  readonly createContainer: (parentId: string, name: string) => Promise<ExplorerItem>;
  readonly capabilities: ExplorerCapabilities;
};
