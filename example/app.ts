import {
  createStrata,
  createMemoryBlobAdapter,
  defineEntity,
} from 'strata-data-sync';
import type { Strata, Repository } from 'strata-data-sync';

// ─── Entity types ────────────────────────────────────────

type Task = { title: string; done: boolean };
type Note = { body: string };

// ─── Entity definitions ──────────────────────────────────

const taskDef = defineEntity<Task>('task');
const noteDef = defineEntity<Note>('note');

// ─── Helpers ─────────────────────────────────────────────

function printTasks(strata: Strata, label: string): void {
  const repo = strata.repo(taskDef) as Repository<Task>;
  const tasks = repo.query();
  console.log(`\n[${label}] Tasks (${tasks.length}):`);
  for (const t of tasks) {
    const status = t.done ? 'done' : 'todo';
    console.log(`  - ${t.title} (${status})`);
  }
}

function printNotes(strata: Strata, label: string): void {
  const repo = strata.repo(noteDef) as Repository<Note>;
  const notes = repo.query();
  console.log(`[${label}] Notes (${notes.length}):`);
  for (const n of notes) {
    console.log(`  - ${n.body}`);
  }
}

// ─── Main ────────────────────────────────────────────────
// Demonstrates creating multiple tenants and switching between them.
// Note: MemoryBlobAdapter is a single flat store — in production a
// cloud adapter (e.g. Azure Blob, S3) uses meta to route each
// tenant to its own container, providing full data isolation.

async function main(): Promise<void> {
  const localAdapter = createMemoryBlobAdapter();

  const strata = createStrata({
    entities: [taskDef, noteDef],
    localAdapter,
    deviceId: 'device-1',
  });

  // ── Create two tenants (workspaces) ──────────────────

  const work = await strata.tenants.create({
    name: 'Work',
    meta: { container: 'work-workspace' },
  });

  const personal = await strata.tenants.create({
    name: 'Personal',
    meta: { container: 'personal-workspace' },
  });

  console.log('Created tenants:');
  const tenants = await strata.tenants.list();
  for (const t of tenants) {
    console.log(`  • ${t.name} (${t.id})`);
  }

  // ── Load work tenant and add data ────────────────────

  await strata.tenants.load(work.id);

  const taskRepo = strata.repo(taskDef) as Repository<Task>;
  taskRepo.save({ title: 'Ship v2 release', done: false });
  taskRepo.save({ title: 'Review PRs', done: true });
  taskRepo.save({ title: 'Update docs', done: false });

  const noteRepo = strata.repo(noteDef) as Repository<Note>;
  noteRepo.save({ body: 'Standup at 9am' });

  printTasks(strata, 'Work');
  printNotes(strata, 'Work');

  // ── Switch to personal tenant ────────────────────────

  await strata.tenants.load(personal.id);
  console.log('\n--- Switched to Personal tenant ---');
  console.log('Active tenant:', strata.tenants.activeTenant$.getValue()?.name);

  // ── Query & update ───────────────────────────────────

  const taskRepo2 = strata.repo(taskDef) as Repository<Task>;
  taskRepo2.save({ title: 'Buy groceries', done: false });

  const allTasks = taskRepo2.query({ where: { done: false } });
  console.log(`\nOpen tasks: ${allTasks.length}`);
  for (const t of allTasks) {
    console.log(`  - ${t.title}`);
  }

  // ── Observe reactive changes ─────────────────────────

  const sub = taskRepo2.observeQuery().subscribe((tasks) => {
    console.log(`\n[Reactive] Task count changed: ${tasks.length}`);
  });

  taskRepo2.save({ title: 'Call dentist', done: true });

  sub.unsubscribe();

  // ── Clean up ─────────────────────────────────────────

  await strata.dispose();
  console.log('\nDone.');
}

main().catch(console.error);
