// Framework types — this is what the strata package would export
// Run: npx tsc --strict --noEmit framework.ts app.ts

import { Observable } from "rxjs";

// --- Core types ---

declare const FieldsBrand: unique symbol;

export interface EntityDef<TName extends string, TFields> {
  readonly name: TName;
  readonly [FieldsBrand]: TFields;
}

export interface BaseEntity {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly device: string;
}

export type Entity<TFields> = BaseEntity & Readonly<TFields>;

// --- Query ---

export interface QueryOptions<TFields> {
  ids?: string[];
  where?: Partial<Entity<TFields>>;
  orderBy?: Array<{ field: keyof Entity<TFields>; direction: "asc" | "desc" }>;
}

// --- Repository ---

export interface Repository<TFields> {
  get(id: string): Promise<Entity<TFields> | undefined>;
  getAll(options?: QueryOptions<TFields>): Promise<Entity<TFields>[]>;
  save(entity: TFields & Partial<BaseEntity>): Promise<string>;
  delete(id: string): Promise<void>;
  observe(id: string): Observable<Entity<TFields> | undefined>;
  observeAll(options?: QueryOptions<TFields>): Observable<Entity<TFields>[]>;
}

// --- Adapter (app implements this) ---

export interface BlobAdapter {
  load(key: string): Promise<string | null>;
  store(key: string, data: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

// --- Strata instance ---

export interface Strata {
  repo<TName extends string, TFields>(
    def: EntityDef<TName, TFields>
  ): Repository<TFields>;
  load(tenantId: string): Promise<void>;
}

// --- Public factory functions ---

export function defineEntity<TFields>(name: string): EntityDef<string, TFields> {
  return { name } as EntityDef<string, TFields>;
}

export function createStrata(config: {
  entities: EntityDef<string, unknown>[];
  localAdapter: BlobAdapter;
  cloudAdapter?: BlobAdapter;
  deviceId: string;
}): Strata {
  // Stub implementation — just proves the types work
  throw new Error("Not implemented");
}
