import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Strata,
  defineEntity,
} from 'strata-data-sync';
import type { StorageAdapter, Tenant } from 'strata-data-sync';

// ─── File-system StorageAdapter ──────────────────────────

class FsStorageAdapter implements StorageAdapter {
  readonly kind = 'storage' as const;
  constructor(private readonly rootDir: string) {}

  private resolvePath(tenant: Tenant | undefined, key: string): string {
    const container = tenant?.meta?.container as string | undefined;
    if (container) return path.join(this.rootDir, container, key);
    return path.join(this.rootDir, key);
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.resolvePath(tenant, key));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch { return null; }
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolvePath(tenant, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    try { await fs.unlink(this.resolvePath(tenant, key)); return true; }
    catch { return false; }
  }

  async list(tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    const dir = path.dirname(this.resolvePath(tenant, prefix));
    try {
      const files = await fs.readdir(dir);
      const base = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : '';
      return files.map(f => base + f).filter(f => f.startsWith(prefix));
    } catch { return []; }
  }
}

// ─── Entity ──────────────────────────────────────────────

type Note = { title: string; body: string };
const noteDef = defineEntity<Note>('note');

// ─── Helper: run a tenant scenario ──────────────────────

async function runScenario(
  label: string,
  storageRoot: string,
  encrypted: boolean,
): Promise<void> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${label}`);
  console.log(`  Storage: ${storageRoot}`);
  console.log(`  Encrypted: ${encrypted}`);
  console.log('='.repeat(50));

  const storage = new FsStorageAdapter(storageRoot);

  const strata = new Strata({
    appId: 'demo',
    entities: [noteDef],
    localAdapter: storage,
    deviceId: 'device-1',
  });

  const tenant = await strata.tenants.create({
    name: label,
    meta: { container: 'data' },
    ...(encrypted ? { encryption: { password: 'my-s3cret!' } } : {}),
  });
  await strata.loadTenant(tenant.id, encrypted ? { password: 'my-s3cret!' } : undefined);

  const repo = strata.repo(noteDef);
  repo.save({ title: 'Hello', body: 'This is a test note' });
  repo.save({ title: 'Secret', body: 'Sensitive information here' });

  console.log(`\nSaved ${repo.query().length} notes`);
  for (const n of repo.query()) {
    console.log(`  - ${n.title}: ${n.body}`);
  }

  await strata.dispose();

  // Show files on disk
  console.log('\nFiles on disk:');
  await printTree(storageRoot, '  ');

  // Try to read a data file raw
  console.log('\nRaw file content (first data blob):');
  await showFirstDataFile(storageRoot);
}

async function showFirstDataFile(dir: string): Promise<void> {
  const files = await collectFiles(dir);
  const dataFile = files.find(f => f.includes('note.'));
  if (!dataFile) {
    console.log('  (no data files found)');
    return;
  }
  const raw = await fs.readFile(dataFile);
  const preview = raw.slice(0, 120);
  const isText = preview.every(b => b >= 0x20 && b < 0x7f || b === 0x0a || b === 0x0d || b === 0x09);
  if (isText) {
    console.log(`  ${path.basename(dataFile)}: ${raw.toString('utf-8').slice(0, 200)}`);
  } else {
    console.log(`  ${path.basename(dataFile)}: <binary> ${raw.slice(0, 40).toString('hex')}...`);
  }
}

async function collectFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...await collectFiles(full));
    else result.push(full);
  }
  return result;
}

async function printTree(dir: string, indent: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      console.log(`${indent}${entry.name}/`);
      await printTree(path.join(dir, entry.name), indent + '  ');
    } else {
      const stat = await fs.stat(path.join(dir, entry.name));
      console.log(`${indent}${entry.name} (${stat.size} bytes)`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const tmpDir = path.join(__dirname, '.tmp');
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });

  const plainDir = path.join(tmpDir, 'plaintext-tenant');
  const encDir = path.join(tmpDir, 'encrypted-tenant');
  await fs.mkdir(plainDir, { recursive: true });
  await fs.mkdir(encDir, { recursive: true });

  await runScenario('Plaintext Tenant', plainDir, false);
  await runScenario('Encrypted Tenant', encDir, true);

  console.log('\n' + '─'.repeat(50));
  console.log('Compare the raw file contents above.');
  console.log('Plaintext tenant: JSON readable. Encrypted tenant: binary.');
}

main().catch(console.error);
