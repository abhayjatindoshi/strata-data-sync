import type { BlobTransform } from './types';

async function streamToUint8Array(
  readable: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export function gzipTransform(): BlobTransform {
  return {
    async encode(data: Uint8Array): Promise<Uint8Array> {
      const stream = new Blob([toArrayBuffer(data)])
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
      return streamToUint8Array(stream);
    },
    async decode(data: Uint8Array): Promise<Uint8Array> {
      const stream = new Blob([toArrayBuffer(data)])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      return streamToUint8Array(stream);
    },
  };
}
