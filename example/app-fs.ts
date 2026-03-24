import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStrata,
  defineEntity,
  partitioned,
} from 'strata-data-sync';
import type { BlobAdapter, Meta, Strata, Repository, SingletonRepository } from 'strata-data-sync';

// ─── File-system BlobAdapter ─────────────────────────────
// Local storage writes with meta=undefined, so blobs go to rootDir.
// Tenant marker blobs use meta.container to scope into subfolders.

function createFsBlobAdapter(rootDir: string): BlobAdapter {
  function resolvePath(meta: Meta, key: string): string {
    const container = (meta as Record<string, unknown>)?.container as string | undefined;
    if (container) {
      return path.join(rootDir, container, key);
    }
    return path.join(rootDir, key);
  }

  return {
    async read(meta, key) {
      try {
        return await fs.readFile(resolvePath(meta, key));
      } catch {
        return null;
      }
    },
    async write(meta, key, data) {
      const filePath = resolvePath(meta, key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const decoded = new TextDecoder().decode(data);
      const dataToWrite = JSON.stringify(JSON.parse(decoded), null, 2);
      await fs.writeFile(filePath, dataToWrite);
    },
    async delete(meta, key) {
      try {
        await fs.unlink(resolvePath(meta, key));
        return true;
      } catch {
        return false;
      }
    },
    async list(meta, prefix) {
      const dir = path.dirname(resolvePath(meta, prefix));
      try {
        const files = await fs.readdir(dir);
        const base = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/') + 1) : '';
        return files
          .map(f => base + f)
          .filter(f => f.startsWith(prefix));
      } catch {
        return [];
      }
    },
  };
}

// ─── Entity types ────────────────────────────────────────

type Task = { title: string; done: boolean; category: string };
type Note = { body: string };
type Settings = { theme: string; language: string };

// ─── Entity definitions (different key strategies) ───────

// Global: all tasks in one partition (task._)
const taskDef = defineEntity<Task>('task');

// Partitioned: notes split by first character of body
const noteDef = defineEntity<Note>('note', {
  keyStrategy: partitioned((n: Note) => n.body[0].toLowerCase()),
});

// Singleton: one settings record
const settingsDef = defineEntity<Settings>('settings', {
  keyStrategy: 'singleton',
});

// ─── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.join(__dirname, '.tmp');
  await fs.rm(rootDir, { recursive: true, force: true });
  await fs.mkdir(rootDir, { recursive: true });
  console.log('Storage root:', rootDir);

  const localAdapter = createFsBlobAdapter(rootDir);

  const strata = createStrata({
    entities: [taskDef, noteDef, settingsDef],
    localAdapter,
    deviceId: 'device-1',
  });

  // ── Create tenant ────────────────────────────────────

  const tenant = await strata.tenants.create({
    name: 'Demo',
    meta: { container: 'demo-workspace' },
  });
  await strata.tenants.load(tenant.id);

  // ── Global strategy: all tasks in one partition ──────

  console.log('\n=== Global strategy (task) ===');
  const taskRepo = strata.repo(taskDef) as Repository<Task>;
  const shipId = taskRepo.save({ title: 'Ship v2', done: false, category: 'dev' });
  taskRepo.save({ title: 'Write tests', done: true, category: 'dev' });
  const coffeeId = taskRepo.save({ title: 'Buy coffee', done: false, category: 'personal' });

  const tasks = taskRepo.query();
  console.log(`All tasks: ${tasks.length}`);
  for (const t of tasks) {
    console.log(`  - [${t.category}] ${t.title} (${t.done ? 'done' : 'todo'})`);
  }

  // Delete a task
  taskRepo.delete(coffeeId);
  console.log(`Deleted "Buy coffee" (id=${coffeeId})`);
  console.log(`Tasks after delete: ${taskRepo.query().length}`);

  // ── Partitioned strategy: notes by first letter ──────

  console.log('\n=== Partitioned strategy (note) ===');
  const noteRepo = strata.repo(noteDef) as Repository<Note>;
  noteRepo.save({ body: 'Alpha release next week' });
  const askId = noteRepo.save({ body: 'Ask about deployment' });
  noteRepo.save({ body: 'Book flight to NYC' });
  noteRepo.save({ body: 'Buy new keyboard' });
  noteRepo.save({ body: 'Call the dentist' });

  const notes = noteRepo.query();
  console.log(`All notes: ${notes.length}`);
  for (const n of notes) {
    console.log(`  - ${n.body}`);
  }

  // Delete a note (from partition "a")
  noteRepo.delete(askId);
  console.log(`Deleted "Ask about deployment" (id=${askId})`);
  console.log(`Notes after delete: ${noteRepo.query().length}`);

  // ── Singleton strategy: one settings record ──────────

  console.log('\n=== Singleton strategy (settings) ===');
  const settingsRepo = strata.repo(settingsDef) as SingletonRepository<Settings>;
  settingsRepo.save({ theme: 'dark', language: 'en' });

  const settings = settingsRepo.get();
  console.log(`Settings: theme=${settings?.theme}, language=${settings?.language}`);

  // update it
  settingsRepo.save({ ...settings!, theme: 'light' });
  const updated = settingsRepo.get();
  console.log(`Updated:  theme=${updated?.theme}, language=${updated?.language}`);

  // Delete singleton
  settingsRepo.delete();
  console.log(`Deleted settings, get() = ${settingsRepo.get()}`);

  // ── Flush & print files on disk ──────────────────────

  await strata.dispose();

  console.log('\n--- Files on disk ---');
  await printTree(rootDir, '');
  // task._          — all tasks in one global partition
  // note.a, note.b, note.c — notes partitioned by first letter
  // settings._      — singleton settings record

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
