import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Strata,
  MemoryBlobAdapter,
  defineEntity,
  partitioned,
} from 'strata-data-sync';

// ─── Entity types ────────────────────────────────────────

type Task = { title: string; done: boolean; priority: number };
type Event = { name: string; date: Date; month: string };
type Config = { theme: string; notifications: boolean };

// ─── Entity definitions ──────────────────────────────────

const taskDef = defineEntity<Task>('task');

const eventDef = defineEntity<Event>('event', {
  keyStrategy: partitioned((e: Event) => e.month),
});

const configDef = defineEntity<Config>('config', {
  keyStrategy: 'singleton',
});

// ─── Two-device sync simulation ──────────────────────────

async function main(): Promise<void> {
  const sharedCloud = new MemoryBlobAdapter();

  console.log('=== Phase 1: Device A — initial data ===');
  const deviceA = new Strata({
    appId: 'complex-demo',
    entities: [taskDef, eventDef, configDef],
    localAdapter: new MemoryBlobAdapter(),
    cloudAdapter: sharedCloud,
    deviceId: 'device-A',
  });

  const tenantA = await deviceA.tenants.create({
    name: 'Shared Project',
    meta: { container: 'shared' },
  });
  await deviceA.loadTenant(tenantA.id);

  // Save tasks
  const tasksA = deviceA.repo(taskDef);
  const id1 = tasksA.save({ title: 'Design API', done: false, priority: 1 });
  const id2 = tasksA.save({ title: 'Write tests', done: false, priority: 2 });
  const id3 = tasksA.save({ title: 'Deploy v1', done: false, priority: 3 });

  // Save partitioned events
  const eventsA = deviceA.repo(eventDef);
  eventsA.save({ name: 'Sprint planning', date: new Date('2026-03-01'), month: '2026-03' });
  eventsA.save({ name: 'Retro', date: new Date('2026-03-15'), month: '2026-03' });
  eventsA.save({ name: 'Launch', date: new Date('2026-04-01'), month: '2026-04' });

  // Save singleton config
  const configA = deviceA.repo(configDef);
  configA.save({ theme: 'dark', notifications: true });

  // Sync A → cloud
  const syncResult1 = await deviceA.sync();
  console.log(`Sync A→cloud: ${syncResult1.partitionsSynced} partitions synced`);

  printState('Device A after sync', deviceA);

  console.log('\n=== Phase 2: Device B — pull from cloud, add data ===');
  const deviceB = new Strata({
    appId: 'complex-demo',
    entities: [taskDef, eventDef, configDef],
    localAdapter: new MemoryBlobAdapter(),
    cloudAdapter: sharedCloud,
    deviceId: 'device-B',
  });

  await deviceB.tenants.create({
    name: 'Shared Project',
    meta: { container: 'shared' },
    id: tenantA.id,
  });
  await deviceB.loadTenant(tenantA.id);

  printState('Device B after hydration', deviceB);

  // Device B modifies data
  const tasksB = deviceB.repo(taskDef);
  tasksB.save({ ...tasksB.get(id1)!, done: true });
  tasksB.save({ title: 'Code review', done: false, priority: 1 });
  tasksB.delete(id3);

  const eventsB = deviceB.repo(eventDef);
  eventsB.save({ name: 'Demo day', date: new Date('2026-04-15'), month: '2026-04' });

  const configB = deviceB.repo(configDef);
  configB.save({ theme: 'light', notifications: false });

  const syncResult2 = await deviceB.sync();
  console.log(`\nSync B→cloud: ${syncResult2.partitionsSynced} partitions synced`);

  console.log('\n=== Phase 3: Device A — pull B\'s changes ===');
  const syncResult3 = await deviceA.sync();
  console.log(`Sync A←cloud: ${syncResult3.partitionsSynced} partitions synced`);

  printState('Device A after re-sync', deviceA);

  console.log('\n=== Phase 4: Verify convergence ===');
  const tasksAFinal = deviceA.repo(taskDef).query();
  const tasksBFinal = deviceB.repo(taskDef).query();

  const eventsAFinal = deviceA.repo(eventDef).query();
  const eventsBFinal = deviceB.repo(eventDef).query();

  const configAFinal = deviceA.repo(configDef).get();
  const configBFinal = deviceB.repo(configDef).get();

  const tasksMatch = tasksAFinal.length === tasksBFinal.length
    && tasksAFinal.every((t, i) => t.id === tasksBFinal[i].id);
  const eventsMatch = eventsAFinal.length === eventsBFinal.length;
  const configMatch = configAFinal?.theme === configBFinal?.theme
    && configAFinal?.notifications === configBFinal?.notifications;

  console.log(`Tasks converged:  ${tasksMatch} (${tasksAFinal.length} items)`);
  console.log(`Events converged: ${eventsMatch} (${eventsAFinal.length} items)`);
  console.log(`Config converged: ${configMatch} (theme=${configAFinal?.theme})`);

  if (!tasksMatch || !eventsMatch || !configMatch) {
    console.error('\n❌ CONVERGENCE FAILED');
    console.log('A tasks:', tasksAFinal.map(t => `${t.title}(${t.done})`));
    console.log('B tasks:', tasksBFinal.map(t => `${t.title}(${t.done})`));
    process.exit(1);
  }

  console.log('\n=== Phase 5: Concurrent edits + conflict resolution ===');
  // Both devices edit the same task — B has later timestamp
  const sharedTask = tasksAFinal.find(t => t.title === 'Write tests');
  if (sharedTask) {
    deviceA.repo(taskDef).save({ ...sharedTask, priority: 99 });
    // Small delay to ensure B gets a later timestamp
    await new Promise(r => setTimeout(r, 10));
    deviceB.repo(taskDef).save({ ...sharedTask, priority: 42 });

    await deviceA.sync();
    await deviceB.sync();
    await deviceA.sync();

    const aResult = deviceA.repo(taskDef).get(sharedTask.id);
    const bResult = deviceB.repo(taskDef).get(sharedTask.id);

    console.log(`Conflict resolution:  A.priority=${aResult?.priority}, B.priority=${bResult?.priority}`);
    console.log(`Both agree: ${aResult?.priority === bResult?.priority}`);
  }

  console.log('\n=== Phase 6: Batch operations ===');
  const batchTasks = deviceA.repo(taskDef);
  const batchIds = batchTasks.saveMany([
    { title: 'Batch 1', done: false, priority: 1 },
    { title: 'Batch 2', done: false, priority: 2 },
    { title: 'Batch 3', done: false, priority: 3 },
    { title: 'Batch 4', done: false, priority: 4 },
    { title: 'Batch 5', done: false, priority: 5 },
  ]);
  console.log(`Saved ${batchIds.length} tasks in batch`);

  batchTasks.deleteMany(batchIds.slice(3));
  console.log(`Deleted last 2 batch tasks`);

  await deviceA.sync();
  await deviceB.sync();

  const bFinalCount = deviceB.repo(taskDef).query().length;
  const aFinalCount = deviceA.repo(taskDef).query().length;
  console.log(`After batch sync: A=${aFinalCount} tasks, B=${bFinalCount} tasks, match=${aFinalCount === bFinalCount}`);

  console.log('\n=== Phase 7: Query operations ===');
  const openTasks = deviceA.repo(taskDef).query({
    where: { done: false },
    orderBy: [{ field: 'priority', direction: 'asc' }],
    limit: 3,
  });
  console.log('Top 3 open tasks by priority:');
  for (const t of openTasks) {
    console.log(`  - [p${t.priority}] ${t.title}`);
  }

  await deviceA.dispose();
  await deviceB.dispose();

  console.log('\n✅ All phases completed successfully.');
}

function printState(label: string, strata: Strata): void {
  console.log(`\n--- ${label} ---`);

  const tasks = strata.repo(taskDef).query();
  console.log(`Tasks (${tasks.length}):`);
  for (const t of tasks) {
    console.log(`  - ${t.title} (${t.done ? 'done' : 'todo'}, p${t.priority})`);
  }

  const events = strata.repo(eventDef).query();
  console.log(`Events (${events.length}):`);
  for (const e of events) {
    console.log(`  - ${e.name} (${e.month})`);
  }

  const config = strata.repo(configDef).get();
  if (config) {
    console.log(`Config: theme=${config.theme}, notifications=${config.notifications}`);
  } else {
    console.log(`Config: (none)`);
  }
}

main().catch(console.error);
