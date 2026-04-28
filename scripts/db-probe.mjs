#!/usr/bin/env node
// Quick diagnostic: what tables/views exist? Has the migration been applied?
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const env = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["'](.*)["']$/, '$1');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

console.log(`URL: ${url}`);
console.log(`Key prefix: ${key.slice(0, 25)}...`);
console.log('');

const checks = [
  { kind: 'NEW (post-migration)', name: 'groups' },
  { kind: 'NEW (post-migration)', name: 'sales_transactions' },
  { kind: 'NEW (post-migration)', name: 'customer_groups' },
  { kind: 'NEW (post-migration)', name: 'reminders' },
  { kind: 'NEW (post-migration)', name: 'customer_next_reminder' },
  { kind: 'NEW (post-migration)', name: 'customer_with_groups' },
  { kind: 'OLD (pre-migration)',  name: 'medications' },
  { kind: 'OLD (pre-migration)',  name: 'reminder_history' },
  { kind: 'OLD (pre-migration)',  name: 'customer_reminders' },
  { kind: 'BOTH',                  name: 'customers' },
];

let newCount = 0, oldCount = 0;

for (const c of checks) {
  try {
    const { data, error, count } = await sb
      .from(c.name)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  ❌  ${c.name.padEnd(28)} (${c.kind}) — ${error.message}`);
    } else {
      console.log(`  ✅  ${c.name.padEnd(28)} (${c.kind}) — ${count ?? 0} rows`);
      if (c.kind.startsWith('NEW')) newCount++;
      if (c.kind.startsWith('OLD')) oldCount++;
    }
  } catch (e) {
    console.log(`  ❌  ${c.name.padEnd(28)} — exception: ${e.message}`);
  }
}

console.log('');
console.log('--- Verdict ---');
if (newCount >= 5) {
  console.log('✅ Migration appears APPLIED (new schema is live).');
} else if (oldCount >= 2) {
  console.log('⚠️  Migration NOT applied — old schema still in place.');
} else {
  console.log('❓ Inconclusive — neither schema fully present.');
}
