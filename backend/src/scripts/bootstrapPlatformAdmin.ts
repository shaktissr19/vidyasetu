import 'dotenv/config';
import { createPlatformAdmin } from '../services/adminAccount.service';
import { pool } from '../config/db';

// Local operator-only first-admin bootstrap. Input is stdin JSON, never argv.
async function main() {
  if (process.stdin.isTTY) throw new Error('Provide account JSON on stdin. See docs/unified-registration.md.');
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 8192) throw new Error('Input is too large');
  }
  const user = await createPlatformAdmin(JSON.parse(input), null);
  console.log(`Platform Admin created: ${user.username}`);
}
main().catch(() => {
  console.error('Admin bootstrap failed. Check input, identity conflicts and whether an admin already exists.');
  process.exitCode = 1;
}).finally(() => pool.end());
