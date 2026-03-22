export type Transform = {
  readonly encode: (data: Uint8Array) => Promise<Uint8Array>;
  readonly decode: (data: Uint8Array) => Promise<Uint8Array>;
};

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

async function readAllBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concatBytes(chunks);
}

export function gzip(): Transform {
  return {
    async encode(data: Uint8Array): Promise<Uint8Array> {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      void writer.write(new Uint8Array(data));
      void writer.close();
      return readAllBytes(cs.readable);
    },
    async decode(data: Uint8Array): Promise<Uint8Array> {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      void writer.write(new Uint8Array(data));
      void writer.close();
      return readAllBytes(ds.readable);
    },
  };
}

const IV_LENGTH = 12;

export function encrypt(key: CryptoKey): Transform {
  return {
    async encode(data: Uint8Array): Promise<Uint8Array> {
      const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new Uint8Array(data),
      );
      return concatBytes([iv, new Uint8Array(encrypted)]);
    },
    async decode(data: Uint8Array): Promise<Uint8Array> {
      const iv = data.slice(0, IV_LENGTH);
      const ciphertext = data.slice(IV_LENGTH);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
      );
      return new Uint8Array(decrypted);
    },
  };
}

export async function applyEncodeTransforms(
  transforms: ReadonlyArray<Transform>,
  data: Uint8Array,
): Promise<Uint8Array> {
  let result = data;
  for (const t of transforms) {
    result = await t.encode(result);
  }
  return result;
}

export async function applyDecodeTransforms(
  transforms: ReadonlyArray<Transform>,
  data: Uint8Array,
): Promise<Uint8Array> {
  let result = data;
  for (let i = transforms.length - 1; i >= 0; i--) {
    result = await transforms[i]!.decode(result);
  }
  return result;
}
