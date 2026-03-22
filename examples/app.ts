// App code — consumes the Strata framework as an installed package
// Run: npm run demo

import {
  defineEntity,
  createStrata,
  createMemoryBlobAdapter,
  dateKeyStrategy,
} from 'strata-data-sync';

// --- 1. Define entities (type-safe tokens) ---

const Transaction = defineEntity<{
  amount: number;
  date: Date;
  accountId: string;
}>("Transaction");

const Account = defineEntity<{
  name: string;
  balance: number;
}>("Account");

// --- 2. Create strata instance with in-memory adapters ---

const strata = createStrata({
  entities: [Transaction, Account],
  localAdapter: createMemoryBlobAdapter(),
  cloudAdapter: createMemoryBlobAdapter(),
  keyStrategy: dateKeyStrategy({ period: 'month' }),
  deviceId: "phone_1",
});

// --- 3. Use repositories — fully typed, zero casts ---

async function demo() {
  console.log("=== Strata Data Sync Demo ===\n");

  // Load a tenant first
  console.log("Creating tenant 'demo-tenant'...");
  const tenant = await strata.tenants.create({ name: "demo-tenant" });
  console.log(`Tenant created with id: ${tenant.id}`);
  await strata.load(tenant.id);
  console.log("Tenant loaded.\n");

  const txnRepo = strata.repo(Transaction);
  const acctRepo = strata.repo(Account);

  // save() — domain fields required, base fields optional
  console.log("Saving a new transaction (amount: 50)...");
  const txnId = await txnRepo.save({ amount: 50, date: new Date(), accountId: "acct_1" });
  console.log(`Transaction saved with id: ${txnId}`);

  // get() → fully typed entity or undefined
  const txn = await txnRepo.get(txnId);
  if (txn) {
    console.log("Retrieved transaction:", {
      id: txn.id,
      amount: txn.amount,
      date: txn.date,
      accountId: txn.accountId,
      createdAt: txn.createdAt,
      updatedAt: txn.updatedAt,
    });
  }

  // save() with id for update
  console.log("\nUpdating transaction amount to 75...");
  await txnRepo.save({ id: txnId, amount: 75, date: new Date(), accountId: "acct_1" });
  const updatedTxn = await txnRepo.get(txnId);
  if (updatedTxn) {
    console.log(`Updated transaction amount: ${updatedTxn.amount}`);
  }

  // getAll() with typed where + orderBy
  const results = await txnRepo.getAll({
    where: { accountId: "acct_1" },
    orderBy: [{ field: "date", direction: "desc" }],
  });
  console.log(`\nFound ${results.length} transaction(s) for accountId "acct_1"`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r) console.log(`  [${i}] id=${r.id}, amount=${r.amount}`);
  }

  // observe() carries the type — BehaviorSubject
  console.log("\nSubscribing to transaction observable...");
  const obs = txnRepo.observe(txnId);
  const sub = obs.subscribe((value: unknown) => {
    const t = value as Record<string, unknown> | undefined;
    if (t) console.log(`  [observe] Transaction updated: $${t['amount']}`);
  });

  // Account repo is independently typed — no cross-contamination
  console.log("\nSaving a new account (Checking, balance: 1000)...");
  const acctId = await acctRepo.save({ name: "Checking", balance: 1000 });
  console.log(`Account saved with id: ${acctId}`);
  const acct = await acctRepo.get(acctId);
  if (acct) {
    console.log(`Account: ${acct.name}, balance: ${acct.balance}`);
  }

  // Trigger sync (store → local → cloud)
  console.log("\nTriggering sync (store → local → cloud)...");
  strata.sync();
  console.log("Sync triggered.");

  // Clean up
  console.log("\nCleaning up...");
  sub.unsubscribe();
  strata.dispose();
  console.log("Done! ✅");
}

demo().catch(console.error);
