import debug from 'debug';
import type { BlobAdapter, BlobTransform, StorageAdapter, Tenant } from './types';
import type { PartitionBlob } from '@strata/persistence';
import { serialize, deserialize } from '@strata/persistence';
import { applyTransforms, reverseTransforms } from './transform';

const log = debug('strata:adapter-bridge');

export type AdapterBridgeOptions = {
  readonly transforms?: ReadonlyArray<BlobTransform>;
};

export class AdapterBridge implements BlobAdapter {
  readonly kind = 'blob' as const;
  private readonly storage: StorageAdapter;
  private readonly transforms: ReadonlyArray<BlobTransform>;

  constructor(
    storage: StorageAdapter,
    options?: AdapterBridgeOptions,
  ) {
    this.storage = storage;
    this.transforms = options?.transforms ?? [];
  }

  async read(tenant: Tenant | undefined, key: string): Promise<PartitionBlob | null> {
    const raw = await this.storage.read(tenant, key);
    if (!raw) return null;
    const bytes = await reverseTransforms(this.transforms, tenant, key, raw);
    const blob = deserialize<PartitionBlob>(bytes);
    log('read %s', key);
    return blob;
  }

  async write(tenant: Tenant | undefined, key: string, data: PartitionBlob): Promise<void> {
    const serialized = serialize(data);
    const bytes = await applyTransforms(this.transforms, tenant, key, serialized);
    await this.storage.write(tenant, key, bytes);
    log('write %s', key);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    return this.storage.delete(tenant, key);
  }

  async list(tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    return this.storage.list(tenant, prefix);
  }
}
