import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = fs.readFileSync('.env.local', 'utf8');
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

console.log('--- customers (sample row, all columns) ---');
const { data: c, error: ce } = await sb.from('customers').select('*').limit(1);
if (ce) console.log('error:', ce.message);
else if (c?.length) console.log('columns:', Object.keys(c[0])); else console.log('(empty)');

console.log('\n--- medications (sample) ---');
const { data: m, error: me } = await sb.from('medications').select('*').limit(2);
if (me) console.log('error:', me.message);
else console.log(m);

console.log('\n--- reminder_history (sample) ---');
const { data: rh, error: rhe } = await sb.from('reminder_history').select('*').limit(2);
if (rhe) console.log('error:', rhe.message);
else console.log(rh);

console.log('\n--- groups (all 0 rows; try insert) ---');
const { error: gIns } = await sb.from('groups').insert({
  slug: 'TEST_PROBE', name: 'TEST', description: 'probe', color: '#000000',
  icon: '🧪', sort_order: 999, is_system: false,
});
console.log('insert test result:', gIns?.message || 'OK');
if (!gIns) {
  await sb.from('groups').delete().eq('slug', 'TEST_PROBE');
  console.log('cleaned up test row.');
}
