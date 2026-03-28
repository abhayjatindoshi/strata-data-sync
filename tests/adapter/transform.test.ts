import { describe, it, expect } from 'vitest';
import { applyTransforms, reverseTransforms } from '@strata/adapter';
import type { BlobTransform } from '@strata/adapter';

describe('Transform Pipeline', () => {
  it('passes through with empty transform array', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = await applyTransforms([], undefined, 'test', data);
    expect(result).toEqual(data);
  });

  it('passes through reverse with empty transform array', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = await reverseTransforms([], undefined, 'test', data);
    expect(result).toEqual(data);
  });

  it('applies single transform on encode', async () => {
    const transform: BlobTransform = {
      async encode(_t, _k, data) {
        return new Uint8Array(data.map(b => b + 1));
      },
      async decode(_t, _k, data) {
        return new Uint8Array(data.map(b => b - 1));
      },
    };
    const data = new Uint8Array([1, 2, 3]);
    const encoded = await applyTransforms([transform], undefined, 'test', data);
    expect(encoded).toEqual(new Uint8Array([2, 3, 4]));
  });

  it('applies transforms in forward order for writes', async () => {
    const order: string[] = [];
    const t1: BlobTransform = {
      async encode(_t, _k, data) { order.push('t1-encode'); return data; },
      async decode(_t, _k, data) { order.push('t1-decode'); return data; },
    };
    const t2: BlobTransform = {
      async encode(_t, _k, data) { order.push('t2-encode'); return data; },
      async decode(_t, _k, data) { order.push('t2-decode'); return data; },
    };

    await applyTransforms([t1, t2], undefined, 'test', new Uint8Array([1]));
    expect(order).toEqual(['t1-encode', 't2-encode']);
  });

  it('applies transforms in reverse order for reads', async () => {
    const order: string[] = [];
    const t1: BlobTransform = {
      async encode(_t, _k, data) { order.push('t1-encode'); return data; },
      async decode(_t, _k, data) { order.push('t1-decode'); return data; },
    };
    const t2: BlobTransform = {
      async encode(_t, _k, data) { order.push('t2-encode'); return data; },
      async decode(_t, _k, data) { order.push('t2-decode'); return data; },
    };

    await reverseTransforms([t1, t2], undefined, 'test', new Uint8Array([1]));
    expect(order).toEqual(['t2-decode', 't1-decode']);
  });

  it('chained transforms are reversible', async () => {
    const t1: BlobTransform = {
      async encode(_t, _k, data) { return new Uint8Array(data.map(b => b + 1)); },
      async decode(_t, _k, data) { return new Uint8Array(data.map(b => b - 1)); },
    };
    const t2: BlobTransform = {
      async encode(_t, _k, data) { return new Uint8Array(data.map(b => b * 2)); },
      async decode(_t, _k, data) { return new Uint8Array(data.map(b => b / 2)); },
    };

    const original = new Uint8Array([1, 2, 3]);
    const encoded = await applyTransforms([t1, t2], undefined, 'test', original);
    const decoded = await reverseTransforms([t1, t2], undefined, 'test', encoded);
    expect(decoded).toEqual(original);
  });
});
