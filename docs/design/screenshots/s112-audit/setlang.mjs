// node setlang.mjs <userId> <en|es> — rebuild-test only; prints before/after.
import { createClient } from '/workspaces/FrameFocus/node_modules/@supabase/supabase-js/dist/index.mjs';
import { readFileSync } from 'node:fs';
for (const line of readFileSync('/workspaces/FrameFocus/apps/web/.env.local', 'utf8').split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL.includes('nmyphyhmfttxkdoposvf')) throw new Error('REFUSING');
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [uid, lang] = process.argv.slice(2);
const { data: b } = await a.from('profiles').select('language').eq('user_id', uid).single();
await a.from('profiles').update({ language: lang }).eq('user_id', uid);
const { data: n } = await a.from('profiles').select('language').eq('user_id', uid).single();
console.log(`lang ${b.language} -> ${n.language}`);
