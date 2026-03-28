import type { Tenant } from './types';
import type { BlobTransform } from './types';

export async function applyTransforms(
  transforms: ReadonlyArray<BlobTransform>,
  tenant: Tenant | undefined,
  key: string,
  data: Uint8Array,
): Promise<Uint8Array> {
  let result = data;
  for (const transform of transforms) {
    result = await transform.encode(tenant, key, result);
  }
  return result;
}

export async function reverseTransforms(
  transforms: ReadonlyArray<BlobTransform>,
  tenant: Tenant | undefined,
  key: string,
  data: Uint8Array,
): Promise<Uint8Array> {
  let result = data;
  for (let i = transforms.length - 1; i >= 0; i--) {
    result = await transforms[i].decode(tenant, key, result);
  }
  return result;
}
