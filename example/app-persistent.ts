import { mkdir, readFile, writeFile, unlink, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Strata, defineEntity } from 'strata-data-sync';
import type { StorageAdapter, Tenant } from 'strata-data-sync';

// ─── __dirname for ESM ───────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Filesystem StorageAdapter ───────────────────────────

class FsStorageAdapter implements StorageAdapter {
  readonly kind = 'storage' as const;

  constructor(private readonly rootDir: string) {}

  private resolvePath(tenant: Tenant | undefined, key: string): string {
    const container = tenant?.meta?.container as string | undefined;
    return container
      ? path.join(this.rootDir, container, key)
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
    const container = tenant?.meta?.container as string | undefined;
    const dir = container ? path.join(this.rootDir, container) : this.rootDir;
    try {
      const entries = await readdir(dir);
      return entries.filter(e => e.startsWith(prefix));
    } catch {
      return [];
    }
  }
}

// ─── Entity ──────────────────────────────────────────────

const Task = defineEntity<{ title: string; done: boolean }>('task');

// ─── Helpers ─────────────────────────────────────────────

async function printTree(dir: string, indent = ''): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    console.log(`${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
    if (entry.isDirectory()) {
      await printTree(path.join(dir, entry.name), indent + '  ');
    }
  }
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  const tmpDir = path.join(__dirname, '.tmp');

  // Clean up from any previous run
  await rm(tmpDir, { recursive: true, force: true });

  const adapter = new FsStorageAdapter(tmpDir);

  // ── Session 1: create tenant and save tasks ────────────
  console.log('=== Session 1: Write ===');
  const db1 = new Strata({
    appId: 'persistent-demo',
    entities: [Task],
    localAdapter: adapter,
    deviceId: 'device-1',
  });

  const tenant = await db1.tenants.create({
    name: 'My Workspace',
    meta: { container: 'workspace' },
  });

  await db1.loadTenant(tenant.id);

  const tasks = db1.repo(Task);
  tasks.save({ title: 'Design schema', done: true });
  tasks.save({ title: 'Implement adapter', done: false });
  tasks.save({ title: 'Write tests', done: false });

  console.log('Saved tasks:');
  for (const t of tasks.query()) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  await db1.dispose();
  console.log('\nStrata disposed — data flushed to disk.\n');

  // ── Show files on disk ─────────────────────────────────
  console.log('Files on disk:');
  await printTree(tmpDir);

  // ── Session 2: reload from disk ────────────────────────
  console.log('\n=== Session 2: Read ===');
  const db2 = new Strata({
    appId: 'persistent-demo',
    entities: [Task],
    localAdapter: adapter,
    deviceId: 'device-1',
  });

  await db2.loadTenant(tenant.id);

  const reloaded = db2.repo(Task).query();
  console.log(`Loaded ${reloaded.length} tasks from disk:`);
  for (const t of reloaded) {
    console.log(`  [${t.done ? 'x' : ' '}] ${t.title}`);
  }

  await db2.dispose();
  console.log('\nDone.');
}

main().catch(console.error);
