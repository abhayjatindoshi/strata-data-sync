import { mkdir, readFile, writeFile, unlink, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Strata,
  AdapterBridge,
  EncryptionTransformService,
  defineEntity,
  InvalidEncryptionKeyError,
  resolveOptions,
} from 'strata-data-sync';
import type { StorageAdapter, Tenant } from 'strata-data-sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Filesystem StorageAdapter ───────────────────────────

class FsStorageAdapter implements StorageAdapter {
  readonly kind = 'storage' as const;

  constructor(private readonly rootDir: string) {}

  private resolvePath(tenant: Tenant | undefined, key: string): string {
    return tenant
      ? path.join(this.rootDir, tenant.id, key)
      : path.join(this.rootDir, key);
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.resolvePath(tenant, key));
    } catch {
      return null;
    }
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolvePath(tenant, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    try {
      await unlink(this.resolvePath(tenant, key));
      return true;
    } catch {
      return false;
    }
  }

  async list(tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    const dir = tenant ? path.join(this.rootDir, tenant.id) : this.rootDir;
    try {
      const entries = await readdir(dir);
      return entries.filter(e => e.startsWith(prefix));
    } catch {
      return [];
    }
  }
}

type Note = { title: string; body: string };
const NoteDef = defineEntity<Note>('note');

async function main() {
  const tmpDir = path.join(__dirname, '.tmp-encrypted');
  await rm(tmpDir, { recursive: true, force: true });

  const storage = new FsStorageAdapter(tmpDir);
  const encryptionService = new EncryptionTransformService(resolveOptions());
  const adapter = new AdapterBridge(storage, {
    transforms: [encryptionService.toTransform()],
  });
  const strata = new Strata({
    appId: 'demo',
    entities: [NoteDef],
    localAdapter: adapter,
    encryptionService,
    deviceId: 'device-1',
  });

  // 1. Create an encrypted tenant
  const encrypted = await strata.tenants.create({
    name: 'Secure',
    meta: {},
    encryption: { password: 'secret123' },
  });
  console.log('Created encrypted tenant:', encrypted.id);

  // 2. Create an unencrypted tenant
  const unencrypted = await strata.tenants.create({
    name: 'Public',
    meta: {},
  });
  console.log('Created unencrypted tenant:', unencrypted.id);

  // 3. Open encrypted tenant with password, save notes, query
  await strata.tenants.open(encrypted.id, { password: 'secret123' });
  const repo = strata.repo(NoteDef);
  repo.save({ title: 'Secret Note', body: 'Eyes only' });
  repo.save({ title: 'Another Secret', body: 'Classified' });
  const secureNotes = repo.query();
  console.log('\n--- Encrypted tenant notes ---');
  for (const n of secureNotes) {
    console.log(`  [${n.title}] ${n.body}`);
  }

  // 4. Switch to unencrypted tenant (no password needed)
  await strata.tenants.open(unencrypted.id);
  const pubRepo = strata.repo(NoteDef);
  pubRepo.save({ title: 'Public Note', body: 'Visible to all' });
  const publicNotes = pubRepo.query();
  console.log('\n--- Unencrypted tenant notes ---');
  for (const n of publicNotes) {
    console.log(`  [${n.title}] ${n.body}`);
  }

  // 5. Try opening encrypted tenant WITHOUT password
  try {
    await strata.tenants.open(encrypted.id);
  } catch {
    console.log('\nPassword required');
  }

  // 6. Try opening with WRONG password
  try {
    await strata.tenants.open(encrypted.id, { password: 'wrongpass' });
  } catch (err) {
    if (err instanceof InvalidEncryptionKeyError) {
      console.log('Wrong password');
    } else {
      throw err;
    }
  }

  await strata.dispose();

  // Show what's on disk
  console.log('\n--- Files on disk ---');
  await printTree(tmpDir);

  console.log('\nDone.');
}

async function printTree(dir: string, indent = ''): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    console.log(`${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
    if (entry.isDirectory()) {
      await printTree(path.join(dir, entry.name), indent + '  ');
    }
  }
}

main();
