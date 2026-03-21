declare const FieldsBrand: unique symbol;

export interface EntityDef<TName extends string, TFields> {
  readonly name: TName;
  readonly [FieldsBrand]: TFields;
}

export function defineEntity<TFields>(name: string): EntityDef<string, TFields> {
  // Cast required: TFields is a phantom type that exists only at compile time
  return { name } as EntityDef<string, TFields>;
}
