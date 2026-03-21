// App code — consumes the framework, zero casts
// Run: npx tsc --strict --noEmit framework.ts app.ts

import {
  defineEntity,
  createStrata,
  type BlobAdapter,
  type Entity,
} from "./framework";

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

// --- 2. App provides an adapter (stub) ---

const localAdapter: BlobAdapter = {
  async load(key) { return null; },
  async store(key, data) {},
  async delete(key) {},
  async list(prefix) { return []; },
};

// --- 3. Create strata instance ---

const strata = createStrata({
  entities: [Transaction, Account],
  localAdapter,
  deviceId: "phone_1",
});

// --- 4. Use repositories — fully typed, zero casts ---

async function demo() {
  const txnRepo = strata.repo(Transaction);
  const acctRepo = strata.repo(Account);

  // get() → Entity<{ amount, date, accountId }> | undefined
  const txn = await txnRepo.get("some-id");
  if (txn) {
    txn.amount;       // ✅ number
    txn.date;         // ✅ Date
    txn.accountId;    // ✅ string
    txn.id;           // ✅ string (BaseEntity)
    txn.createdAt;    // ✅ Date (BaseEntity)
    txn.updatedAt;    // ✅ Date (BaseEntity)
    txn.version;      // ✅ number (BaseEntity)
    txn.device;       // ✅ string (BaseEntity)
    // @ts-expect-error — 'foo' does not exist
    txn.foo;
  }

  // save() — domain fields required, base fields optional
  await txnRepo.save({ amount: 50, date: new Date(), accountId: "acct_1" });

  // save() with id for update
  await txnRepo.save({ id: "existing", amount: 75, date: new Date(), accountId: "acct_1" });

  // save() missing required field — compile error
  // @ts-expect-error — 'accountId' is missing
  await txnRepo.save({ amount: 50, date: new Date() });

  // getAll() with typed where + orderBy
  const results = await txnRepo.getAll({
    where: { accountId: "acct_1" },
    orderBy: [{ field: "date", direction: "desc" }],
  });
  results[0].amount; // ✅ number

  // getAll() with invalid field — compile error
  // @ts-expect-error — 'foo' does not exist on Transaction
  await txnRepo.getAll({ where: { foo: "bar" } });

  // observe() carries the type
  txnRepo.observe("some-id").subscribe((txn) => {
    if (txn) {
      txn.amount;     // ✅ number
      txn.createdAt;  // ✅ Date
    }
  });

  // Account repo is independently typed — no cross-contamination
  const acct = await acctRepo.get("acct-id");
  if (acct) {
    acct.name;        // ✅ string
    acct.balance;     // ✅ number
    // @ts-expect-error — 'amount' does not exist on Account
    acct.amount;
  }
}
