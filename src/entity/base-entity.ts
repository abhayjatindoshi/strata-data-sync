export type BaseEntity = {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly device: string;
};

export type Entity<TFields> = BaseEntity & Readonly<TFields>;
