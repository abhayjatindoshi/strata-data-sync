import type { TypeMarker } from './types.js';

function isTypeMarker(value: unknown): value is TypeMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__t' in value &&
    'v' in value
  );
}

export function typeMarkerReplacer(
  this: Record<string, unknown>,
  key: string,
  value: unknown,
): unknown {
  const raw = this[key];
  if (raw instanceof Date) {
    return { __t: 'D', v: raw.toISOString() };
  }
  return value;
}

export function typeMarkerReviver(
  _key: string,
  value: unknown,
): unknown {
  if (isTypeMarker(value) && value.__t === 'D' && typeof value.v === 'string') {
    return new Date(value.v);
  }
  return value;
}

export function serialize(data: unknown): string {
  return JSON.stringify(data, typeMarkerReplacer);
}

export function deserialize(json: string): unknown {
  return JSON.parse(json, typeMarkerReviver) as unknown;
}
