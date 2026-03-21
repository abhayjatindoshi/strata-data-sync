export type PartitionMetadata = {
  readonly hash: number;
  readonly hlcTimestamp: number;
};

export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function computePartitionMetadata(
  serializedContent: string,
  hlcTimestamp: number,
): PartitionMetadata {
  return {
    hash: fnv1a(serializedContent),
    hlcTimestamp,
  };
}
