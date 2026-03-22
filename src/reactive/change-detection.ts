type HasIdVersion = {
  readonly id: string;
  readonly version: number;
};

export function entityEquals(
  a: HasIdVersion | undefined,
  b: HasIdVersion | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return a.id === b.id && a.version === b.version;
}

export function entityArrayEquals(
  a: ReadonlyArray<HasIdVersion>,
  b: ReadonlyArray<HasIdVersion>,
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, i) => entityEquals(item, b[i]));
}
