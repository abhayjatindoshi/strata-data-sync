import {
  Strata,
  MemoryBlobAdapter,
  defineEntity,
  saveTenantPrefs,
} from 'strata-data-sync';

// ── Entity ───────────────────────────────────────────────

type Task = { title: string; done: boolean };
const TaskDef = defineEntity<Task>('task');

// ── Shared cloud adapter (simulates a remote backend) ───

const sharedCloud = new MemoryBlobAdapter();

// Both users derive the same tenant ID from the folder metadata
const deriveTenantId = (meta: Record<string, unknown>) =>
  `shared-${(meta.folderId as string).substring(0, 4)}`;

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('=== Tenant Sharing Demo ===\n');

  // ─── User A: create workspace and add tasks ───────────

  console.log('--- User A: Creating workspace ---');

  const localA = new MemoryBlobAdapter();
  const strataA = new Strata({
    appId: 'sharing-demo',
    entities: [TaskDef],
    localAdapter: localA,
    cloudAdapter: sharedCloud,
    deviceId: 'device-A',
    deriveTenantId,
  });

  const tenantA = await strataA.tenants.create({
    name: 'Project X',
    meta: { folderId: 'abc123' },
  });
  console.log(`  Tenant created: ${tenantA.id}`);

  await strataA.loadTenant(tenantA.id);

  const tasks = strataA.repo(TaskDef);
  tasks.save({ title: 'Design the schema', done: true });
  tasks.save({ title: 'Write the tests', done: false });
  tasks.save({ title: 'Ship it!', done: false });
  console.log(`  Saved ${tasks.query().length} tasks`);

  // Save tenant prefs to the shared cloud so User B can pick them up
  await saveTenantPrefs(sharedCloud, tenantA, {
    name: 'Project X',
    icon: '📁',
  });
  console.log('  Saved tenant prefs (name: "Project X", icon: 📁)');

  // Sync to cloud
  const syncResult = await strataA.sync();
  console.log(`  Synced to cloud (${syncResult.entitiesUpdated} entities pushed)`);

  await strataA.dispose();
  console.log('  User A disposed\n');

  // ─── User B: join existing workspace ──────────────────

  console.log('--- User B: Joining workspace ---');

  const localB = new MemoryBlobAdapter();
  const strataB = new Strata({
    appId: 'sharing-demo',
    entities: [TaskDef],
    localAdapter: sharedCloud,  // User B reads directly from cloud for setup
    deviceId: 'device-B',
    deriveTenantId,
  });

  // setup() detects the existing workspace via the marker blob
  const tenantB = await strataB.tenants.setup({
    meta: { folderId: 'abc123' },
  });
  console.log(`  Setup detected tenant: ${tenantB.id} (name: "${tenantB.name}")`);

  await strataB.loadTenant(tenantB.id);

  const tasksB = strataB.repo(TaskDef);
  const allTasks = tasksB.query();
  console.log(`  User B sees ${allTasks.length} tasks:`);
  for (const t of allTasks) {
    console.log(`    ${t.done ? '✅' : '⬜'} ${t.title}`);
  }

  // Tenant name should be "Project X" from prefs
  console.log(`\n  Tenant name from prefs: "${tenantB.name}"`);

  await strataB.dispose();
  console.log('  User B disposed\n');

  console.log('=== Done ===');
}

main().catch(console.error);
