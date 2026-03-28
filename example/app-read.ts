import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Strata,
  defineEntity,
  partitioned,
} from 'strata-data-sync';
import type { StorageAdapter, Tenant } from 'strata-data-sync';

// ─── File-system StorageAdapter (same as app-fs) ─────────

class FsStorageAdapter implements StorageAdapter {
  readonly kind = 'storage';
  constructor(private readonly rootDir: string) {}

  private resolvePath(tenant: Tenant | undefined, key: string): string {
    const container = tenant?.meta?.container as string | undefined;
    if (container) {
      return path.join(this.rootDir, container, key);
    }
    return path.join(this.rootDir, key);
  }

  async read(tenant: Tenant | undefined, key: string): Promise<Uint8Array | null> {
    try {
      const buf = await fs.readFile(this.resolvePath(tenant, key));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  }

  async write(tenant: Tenant | undefined, key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolvePath(tenant, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async delete(tenant: Tenant | undefined, key: string): Promise<boolean> {
    try {
      await fs.unlink(this.resolvePath(tenant, key));
      return true;
    } catch {
      return false;
    }
  }

  async list(tenant: Tenant | undefined, prefix: string): Promise<string[]> {
    const dir = path.dirname(this.resolvePath(tenant, prefix));
    try {
      const files = await fs.readdir(dir);
      const base = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : '';
      return files
        .map(f => base + f)
        .filter(f => f.startsWith(prefix));
    } catch {
      return [];
    }
  }
}

// ─── Entity definitions (must match app-fs) ──────────────

type Task = { title: string; done: boolean; category: string };
type Note = { body: string };
type Settings = { theme: string; language: string };

const taskDef = defineEntity<Task>('task');

const noteDef = defineEntity<Note>('note', {
  keyStrategy: partitioned((n: Note) => n.body[0].toLowerCase()),
});

const settingsDef = defineEntity<Settings>('settings', {
  keyStrategy: 'singleton',
});

// ─── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.join(__dirname, '.tmp');

  const exists = await fs.stat(rootDir).catch(() => null);
  if (!exists) {
    console.error('No .tmp directory found. Run app-fs.ts first.');
    process.exit(1);
  }

  const appId = 'strata-example-fs';
  const password = 's3cret-passw0rd!';
  const storage = new FsStorageAdapter(rootDir);

  // Show raw (encrypted) bytes for a data file
  console.log('=== Raw encrypted bytes (task._) ===');
  const rawBytes = await fs.readFile(path.join(rootDir, 'demo-workspace', appId, 'task._'));
  console.log(`  ${rawBytes.length} bytes, hex: ${rawBytes.subarray(0, 32).toString('hex')}…\n`);

  // Decrypt and load via Strata
  const strata = new Strata({
    appId,
    entities: [taskDef, noteDef, settingsDef],
    localAdapter: storage,
    deviceId: 'device-reader',
  });

  // Load existing tenant
  const tenants = await strata.tenants.list();
  console.log(`=== Tenants (${tenants.length}) ===`);
  for (const t of tenants) {
    console.log(`  • ${t.name} (${t.id})`);
  }

  const tenant = tenants[0];
  if (!tenant) {
    console.error('No tenants found.');
    await strata.dispose();
    return;
  }

  await strata.loadTenant(tenant.id);

  // Read tasks
  console.log('\n=== Tasks ===');
  const tasks = strata.repo(taskDef);
  for (const t of tasks.query()) {
    console.log(`  - [${t.category}] ${t.title} (${t.done ? 'done' : 'todo'})`);
  }

  // Read notes
  console.log('\n=== Notes ===');
  const notes = strata.repo(noteDef);
  for (const n of notes.query()) {
    console.log(`  - ${n.body}`);
  }

  // Read settings
  console.log('\n=== Settings ===');
  const settings = strata.repo(settingsDef);
  const val = settings.get();
  if (val) {
    console.log(`  theme=${val.theme}, language=${val.language}`);
  } else {
    console.log('  (no settings saved)');
  }

  await strata.dispose();
  console.log('\nDone.');
}

main().catch(console.error);
