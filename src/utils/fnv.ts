export const FNV_OFFSET = 2166136261;
export const FNV_PRIME = 16777619;

export function fnv1a(input: string): number {
  return fnv1aAppend(FNV_OFFSET, input);
}

export function fnv1aAppend(hash: number, input: string): number {
  let h = hash;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}
