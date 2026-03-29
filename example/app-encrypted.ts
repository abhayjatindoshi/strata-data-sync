import {
  Strata,
  MemoryStorageAdapter,
  defineEntity,
  InvalidEncryptionKeyError,
} from 'strata-data-sync';

type Note = { title: string; body: string };
const NoteDef = defineEntity<Note>('note');

async function main() {
  const storage = new MemoryStorageAdapter();
  const strata = new Strata({
    appId: 'demo',
    entities: [NoteDef],
    localAdapter: storage,
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

  // 3. Load encrypted tenant with password, save notes, query
  await strata.loadTenant(encrypted.id, { password: 'secret123' });
  const repo = strata.repo(NoteDef);
  repo.save({ title: 'Secret Note', body: 'Eyes only' });
  repo.save({ title: 'Another Secret', body: 'Classified' });
  const secureNotes = repo.query();
  console.log('\n--- Encrypted tenant notes ---');
  for (const n of secureNotes) {
    console.log(`  [${n.title}] ${n.body}`);
  }

  // 4. Switch to unencrypted tenant (no password needed)
  await strata.loadTenant(unencrypted.id);
  const pubRepo = strata.repo(NoteDef);
  pubRepo.save({ title: 'Public Note', body: 'Visible to all' });
  const publicNotes = pubRepo.query();
  console.log('\n--- Unencrypted tenant notes ---');
  for (const n of publicNotes) {
    console.log(`  [${n.title}] ${n.body}`);
  }

  // 5. Try loading encrypted tenant WITHOUT password
  try {
    await strata.loadTenant(encrypted.id);
  } catch {
    console.log('\nPassword required');
  }

  // 6. Try loading with WRONG password
  try {
    await strata.loadTenant(encrypted.id, { password: 'wrongpass' });
  } catch (err) {
    if (err instanceof InvalidEncryptionKeyError) {
      console.log('Wrong password');
    } else {
      throw err;
    }
  }

  await strata.dispose();
  console.log('\nDone.');
}

main();
