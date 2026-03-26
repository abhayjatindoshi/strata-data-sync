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

// ─── Multi-tenant demo ──────────────────────────────────

class MultiTenantDemo {
  private readonly strata: Strata;

  constructor() {
    this.strata = createStrata({
      entities: [taskDef, noteDef],
      localAdapter: createMemoryBlobAdapter(),
      deviceId: 'device-1',
    });
  }

  async run(): Promise<void> {
    const work = await this.strata.tenants.create({
      name: 'Work',
      meta: { container: 'work-workspace' },
    });
    const personal = await this.strata.tenants.create({
      name: 'Personal',
      meta: { container: 'personal-workspace' },
    });

    console.log('Created tenants:');
    for (const t of await this.strata.tenants.list()) {
      console.log(`  • ${t.name} (${t.id})`);
    }

    await this.seedWorkTenant(work.id);
    await this.seedPersonalTenant(personal.id);

    await this.strata.dispose();
    console.log('\nDone.');
  }

  private async seedWorkTenant(tenantId: string): Promise<void> {
    await this.strata.tenants.load(tenantId);

    const tasks = this.strata.repo(taskDef) as Repository<Task>;
    tasks.save({ title: 'Ship v2 release', done: false });
    tasks.save({ title: 'Review PRs', done: true });
    tasks.save({ title: 'Update docs', done: false });

    const notes = this.strata.repo(noteDef) as Repository<Note>;
    notes.save({ body: 'Standup at 9am' });

    this.printRepo('Work', tasks, notes);
  }

  private async seedPersonalTenant(tenantId: string): Promise<void> {
    await this.strata.tenants.load(tenantId);
    console.log('\n--- Switched to Personal tenant ---');
    console.log('Active tenant:', this.strata.tenants.activeTenant$.getValue()?.name);

    const tasks = this.strata.repo(taskDef) as Repository<Task>;
    tasks.save({ title: 'Buy groceries', done: false });

    const open = tasks.query({ where: { done: false } });
    console.log(`\nOpen tasks: ${open.length}`);
    for (const t of open) {
      console.log(`  - ${t.title}`);
    }

    const sub = tasks.observeQuery().subscribe((all) => {
      console.log(`\n[Reactive] Task count changed: ${all.length}`);
    });
    tasks.save({ title: 'Call dentist', done: true });
    sub.unsubscribe();
  }

  private printRepo(label: string, tasks: Repository<Task>, notes: Repository<Note>): void {
    console.log(`\n[${label}] Tasks (${tasks.query().length}):`);
    for (const t of tasks.query()) {
      console.log(`  - ${t.title} (${t.done ? 'done' : 'todo'})`);
    }
    console.log(`[${label}] Notes (${notes.query().length}):`);
    for (const n of notes.query()) {
      console.log(`  - ${n.body}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────

new MultiTenantDemo().run().catch(console.error);
