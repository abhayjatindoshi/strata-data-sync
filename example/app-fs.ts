import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Strata,
  defineEntity,
  partitioned,
} from 'strata-data-sync';
import type { StorageAdapter, Tenant } from 'strata-data-sync';

// ─── File-system StorageAdapter ──────────────────────────

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

// ─── Entity types ────────────────────────────────────────

type Task = { title: string; done: boolean; category: string };
type Note = { body: string };
type Settings = { theme: string; language: string };

// ─── Entity definitions (different key strategies) ───────

const taskDef = defineEntity<Task>('task');

const noteDef = defineEntity<Note>('note', {
  keyStrategy: partitioned((n: Note) => n.body[0].toLowerCase()),
});

const settingsDef = defineEntity<Settings>('settings', {
  keyStrategy: 'singleton',
});

// ─── Key-strategy demo app ───────────────────────────────

class KeyStrategyDemo {
  private readonly strata: Strata;

  private constructor(strata: Strata) {
    this.strata = strata;
  }

  static async create(storage: StorageAdapter, password: string): Promise<KeyStrategyDemo> {
    const strata = new Strata({
      appId: 'strata-example-fs',
      entities: [taskDef, noteDef, settingsDef],
      localAdapter: storage,
      deviceId: 'device-1',
    });
    return new KeyStrategyDemo(strata);
  }

  async init(): Promise<void> {
    const tenant = await this.strata.tenants.create({
      name: 'Demo',
      meta: { container: 'demo-workspace' },
      encryption: { password: 's3cret-passw0rd!' },
    });
    await this.strata.loadTenant(tenant.id, { password: 's3cret-passw0rd!' });
  }

  demoGlobalStrategy(): void {
    console.log('\n=== Global strategy (task) ===');
    const repo = this.strata.repo(taskDef);
    repo.save({ title: 'Ship v2', done: false, category: 'dev' });
    repo.save({ title: 'Write tests', done: true, category: 'dev' });
    const coffeeId = repo.save({ title: 'Buy coffee', done: false, category: 'personal' });

    for (const t of repo.query()) {
      console.log(`  - [${t.category}] ${t.title} (${t.done ? 'done' : 'todo'})`);
    }

    repo.delete(coffeeId);
    console.log(`Deleted "Buy coffee", remaining: ${repo.query().length}`);
  }

  demoPartitionedStrategy(): void {
    console.log('\n=== Partitioned strategy (note) ===');
    const repo = this.strata.repo(noteDef);
    repo.save({ body: 'Alpha release next week' });
    const askId = repo.save({ body: 'Ask about deployment' });
    repo.save({ body: 'Book flight to NYC' });
    repo.save({ body: 'Buy new keyboard' });
    repo.save({ body: 'Call the dentist' });

    for (const n of repo.query()) {
      console.log(`  - ${n.body}`);
    }

    repo.delete(askId);
    console.log(`Deleted "Ask about deployment", remaining: ${repo.query().length}`);
  }

  demoSingletonStrategy(): void {
    console.log('\n=== Singleton strategy (settings) ===');
    const repo = this.strata.repo(settingsDef);
    repo.save({ theme: 'dark', language: 'en' });

    const settings = repo.get();
    console.log(`Settings: theme=${settings?.theme}, language=${settings?.language}`);

    repo.save({ ...settings!, theme: 'light' });
    console.log(`Updated:  theme=${repo.get()?.theme}, language=${repo.get()?.language}`);

    repo.delete();
    console.log(`Deleted settings, get() = ${repo.get()}`);
  }

  async dispose(): Promise<void> {
    await this.strata.dispose();
  }
}

// ─── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.join(__dirname, '.tmp');
  await fs.rm(rootDir, { recursive: true, force: true });
  await fs.mkdir(rootDir, { recursive: true });
  console.log('Storage root:', rootDir);

  const demo = await KeyStrategyDemo.create(new FsStorageAdapter(rootDir), 's3cret-passw0rd!');
  await demo.init();

  demo.demoGlobalStrategy();
  demo.demoPartitionedStrategy();
  demo.demoSingletonStrategy();

  await demo.dispose();

  console.log('\n--- Files on disk ---');
  await printTree(rootDir, '');
  console.log('\nDone. Data persisted in example/.tmp/');
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

main().catch(console.error);
