import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveKey, decrypt, importDek,
} from 'strata-data-sync';

const ENCRYPTION_VERSION = 1;

function isEncrypted(data: Uint8Array): boolean {
  return data.length > 0 && data[0] !== 0x7B; // not '{'
}

async function decryptDirectory(
  dir: string,
  appId: string,
  password: string,
): Promise<void> {
  console.log(`Decrypting: ${dir}`);
  console.log(`  appId:    ${appId}`);

  // Step 1: Derive marker key
  const markerKey = await deriveKey(password, appId);

  // Step 2: Read and decrypt __strata
  const strataPath = path.join(dir, '__strata');
  const strataBytes = new Uint8Array(await fs.readFile(strataPath));

  if (!isEncrypted(strataBytes)) {
    console.log('\n__strata is not encrypted. Nothing to do.');
    return;
  }

  let strataPlaintext: Uint8Array;
  try {
    strataPlaintext = await decrypt(strataBytes, markerKey);
  } catch {
    console.error('\nFailed to decrypt __strata — wrong password?');
    process.exit(1);
  }

  // Step 3: Extract DEK from marker blob
  const marker = JSON.parse(new TextDecoder().decode(strataPlaintext));
  const dekBase64 = marker?.__system?.marker?.dek;
  if (!dekBase64) {
    console.error('\nNo DEK found in __strata marker blob.');
    process.exit(1);
  }

  const dek = await importDek(dekBase64);
  console.log('\nPassword verified. DEK extracted.\n');

  // Step 4: Write decrypted __strata (without the dek field)
  await fs.writeFile(strataPath, strataPlaintext);
  console.log(`  Decrypted: __strata`);

  // Step 5: Find and decrypt all other files
  const files = await collectFiles(dir);
  for (const filePath of files) {
    const name = path.relative(dir, filePath);
    if (name === '__strata' || name === '__tenants') continue;

    const raw = new Uint8Array(await fs.readFile(filePath));
    if (!isEncrypted(raw)) {
      console.log(`  Skipped (plaintext): ${name}`);
      continue;
    }

    try {
      const decrypted = await decrypt(raw, dek);
      await fs.writeFile(filePath, decrypted);
      console.log(`  Decrypted: ${name}`);
    } catch (err) {
      console.error(`  FAILED: ${name} — ${err}`);
    }
  }

  console.log('\nDone.');
}

async function collectFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) result.push(...await collectFiles(full));
    else result.push(full);
  }
  return result;
}

// ─── Main ────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Usage: npx tsx decrypt-files.ts <dir> <appId> <password>');
  console.log('Example: npx tsx decrypt-files.ts .tmp/encrypted-tenant/data demo my-s3cret!');
  process.exit(1);
}

const [dir, appId, password] = args;
decryptDirectory(dir, appId, password).catch(console.error);
