import type { BlobTransform } from './types';
import { toArrayBuffer, streamToUint8Array } from '@strata/utils';

export function gzipTransform(): BlobTransform {
  return {
    async encode(_tenant, _key, data: Uint8Array): Promise<Uint8Array> {
      const stream = new Blob([toArrayBuffer(data)])
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
      return streamToUint8Array(stream);
    },
    async decode(_tenant, _key, data: Uint8Array): Promise<Uint8Array> {
      const stream = new Blob([toArrayBuffer(data)])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      return streamToUint8Array(stream);
    },
  };
}
