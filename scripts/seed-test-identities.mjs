#!/usr/bin/env node
/**
 * Seed the PERSISTENT test identities and the second test company.
 * Closes GATED.md Gate 2 (#103 foreman test identity, #104 second test company).
 *
 *   node scripts/seed-test-identities.mjs
 *
 * IDEMPOTENT — safe to re-run. Anything that already exists is left alone and
 * reported as `exists`; only what is missing gets created.
 *
 * GATED on rebuild-test. It refuses to run against any other project, and in
 * particular against production, because it writes auth users. Do not remove
 * that check.
 *
 * WHY A SCRIPT AND NOT A MIGRATION: these are rows, not schema, and they must
 * never reach production. A migration would be applied to every environment by
 * definition; this cannot be run anywhere but rebuild-test.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_PROJECT_REF = 'nmyphyhmfttxkdoposvf'; // framefocus-rebuild-test

// ── env ─────────────────────────────────────────────────────────────────────
for (const line of readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
if (!URL_.includes(REQUIRED_PROJECT_REF)) {
  throw new Error(`REFUSING TO RUN: linked project is not ${REQUIRED_PROJECT_REF}. URL=${URL_}`);
}

const db = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// ── what we are seeding ─────────────────────────────────────────────────────
//
// The shared password is documented in STATE.md → Test Data. It exists so these
// identities can be signed into in a browser; rebuild-test holds no real data.
const TEST_PASSWORD = 'FrameFocusTest!2026';

const COMPANY_A_NAME = 'Bishop Contracting';
const COMPANY_B_NAME = 'Ridgeline Builders (TEST CO 2)';
const COMPANY_B_SLUG = 'ridgeline-test-co-2';

/** Company A — every role FrameFocus gates on. */
const COMPANY_A_IDENTITIES = [
  { email: 'josh+test50@worthprop.com', role: 'owner', first: 'QA', last: 'Owner A' },
  { email: 'josh+qa-admin@worthprop.com', role: 'admin', first: 'QA', last: 'Admin A' },
  { email: 'josh+pm@worthprop.com', role: 'project_manager', first: 'QA', last: 'PM A' },
  { email: 'josh+qa-foreman@worthprop.com', role: 'foreman', first: 'QA', last: 'Foreman A' },
  { email: 'josh+crew@worthprop.com', role: 'crew_member', first: 'QA', last: 'Crew A' },
];

/** Company B — #104. One identity is enough to prove isolation both ways. */
const COMPANY_B_IDENTITIES = [
  { email: 'josh+qa-b-owner@worthprop.com', role: 'owner', first: 'QA', last: 'Owner B' },
];

const log = [];
const note = (what, status, detail = '') => {
  log.push({ what, status, detail });
  console.log(`  ${status.padEnd(8)} ${what}${detail ? `  — ${detail}` : ''}`);
};

const must = (label, error) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/** Create the auth user + profile if absent; never touch an existing one's role. */
async function ensureIdentity({ email, role, first, last }, companyId) {
  const { data: existing } = await db.from('profiles').select('id, user_id, role').eq('email', email).maybeSingle();
  if (existing) {
    // Set the shared password even on identities that predate it (Josh's
    // originals), so STATE.md's documented credential is true for ALL of them
    // and the harnesses can use the password grant rather than magic links —
    // Supabase rate-limits OTP generation hard enough to break repeated runs.
    const { error } = await db.auth.admin.updateUserById(existing.user_id, {
      password: TEST_PASSWORD,
    });
    must(`password(${email})`, error);
    note(`identity ${email}`, 'exists', `role=${existing.role}, password set`);
    return existing;
  }

  const { data: created, error: uErr } = await db.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  must(`createUser(${email})`, uErr);

  const { data: profile, error: pErr } = await db
    .from('profiles')
    .insert({
      user_id: created.user.id,
      company_id: companyId,
      email,
      first_name: first,
      last_name: last,
      role,
    })
    .select('id, user_id, role')
    .single();
  must(`profile(${email})`, pErr);

  // `profiles_create_member` auto-creates the company_members row.
  note(`identity ${email}`, 'CREATED', `role=${role}`);
  return profile;
}

async function memberIdFor(profileId) {
  const { data } = await db.from('company_members').select('id').eq('profile_id', profileId).single();
  return data.id;
}

// ── run ─────────────────────────────────────────────────────────────────────
console.log(`\nSeeding test identities on ${REQUIRED_PROJECT_REF} (framefocus-rebuild-test)\n`);

// Company A must already exist — this script never creates it.
const { data: companyA } = await db.from('companies').select('id, name').eq('name', COMPANY_A_NAME).single();
if (!companyA) throw new Error(`Company A "${COMPANY_A_NAME}" not found — nothing to attach identities to.`);
note(`company ${companyA.name}`, 'exists', companyA.id);

console.log('\nCompany A identities:');
for (const identity of COMPANY_A_IDENTITIES) await ensureIdentity(identity, companyA.id);

// ── Company B (#104) ────────────────────────────────────────────────────────
console.log('\nCompany B (cross-company isolation):');
let { data: companyB } = await db.from('companies').select('id, name').eq('slug', COMPANY_B_SLUG).maybeSingle();
if (companyB) {
  note(`company ${companyB.name}`, 'exists', companyB.id);
} else {
  const { data, error } = await db
    .from('companies')
    .insert({ name: COMPANY_B_NAME, slug: COMPANY_B_SLUG, timezone: 'America/New_York' })
    .select('id, name')
    .single();
  must('company B', error);
  companyB = data;
  note(`company ${companyB.name}`, 'CREATED', companyB.id);
}

const bProfiles = [];
for (const identity of COMPANY_B_IDENTITIES) bProfiles.push(await ensureIdentity(identity, companyB.id));
const bOwnerMemberId = await memberIdFor(bProfiles[0].id);

// ── Isolation fixtures — one row in each table the proof covers ─────────────
//
// Seeded for BOTH companies, not just B. The isolation proof asserts in both
// directions, and a direction whose source company has no rows proves nothing:
// company A carries no client_payments of its own (the 7E harness deletes its
// own), so without an A-side payment the A→B payment probe silently skipped.
//
// Every insert sets company_id EXPLICITLY: the column defaults call
// get_my_company_id(), which is NULL under the service role.

async function ensureRow(label, table, match, insert) {
  const query = db.from(table).select('id');
  for (const [col, value] of Object.entries(match)) query.eq(col, value);
  const { data: found } = await query.maybeSingle();
  if (found) {
    note(label, 'exists', found.id);
    return found.id;
  }
  const { data, error } = await db.from(table).insert(insert).select('id').single();
  must(label, error);
  note(label, 'CREATED', data.id);
  return data.id;
}

/**
 * One row in every table the isolation proof covers, for one company.
 * `tag` distinguishes the two sets ("A" / "B") and appears in every name, so
 * these are obvious in the UI and never mistaken for real work.
 */
async function seedIsolationFixtures(company, tag, ownerMemberId) {
  console.log(`\nCompany ${tag} isolation fixtures:`);
  const name = `QA ${tag} — isolation fixture`;

  const contactId = await ensureRow(
    `contact ${tag}`, 'contacts',
    { company_id: company.id, last_name: `Client${tag}` },
    {
      company_id: company.id, contact_type: 'client',
      first_name: 'QA', last_name: `Client${tag}`,
      email: `qa-client-${tag.toLowerCase()}@example.invalid`,
    }
  );

  // `project_number` / `project_internal_seq` default to next_project_number() /
  // next_project_internal_seq(), which RAISE when get_my_company_id() is NULL —
  // and it is NULL under the service role. Supply both explicitly and advance
  // the company's counters to match, so creating a project in the app later
  // carries on from the right number instead of colliding.
  let projectId;
  {
    const { data: found } = await db
      .from('projects').select('id')
      .eq('company_id', company.id).eq('name', name).maybeSingle();
    if (found) {
      projectId = found.id;
      note(`project ${tag}`, 'exists', found.id);
    } else {
      const { data: counters } = await db
        .from('companies')
        .select('estimate_number_sequence, project_internal_sequence')
        .eq('id', company.id).single();
      const seq = counters.estimate_number_sequence + 1;
      const internal = counters.project_internal_sequence + 1;
      const projectNumber = `PRJ-${String(seq).padStart(3, '0')}`;

      const { data, error } = await db
        .from('projects')
        .insert({
          company_id: company.id, name, contact_id: contactId,
          project_type: 'fixed_price', contract_value: 50000, retainage_percent: 5,
          project_number: projectNumber, project_internal_seq: internal,
        })
        .select('id').single();
      must(`project ${tag}`, error);
      projectId = data.id;

      must(`counters ${tag}`, (await db.from('companies').update({
        estimate_number_sequence: seq, project_internal_sequence: internal,
      }).eq('id', company.id)).error);
      note(`project ${tag}`, 'CREATED', `${data.id} (${projectNumber})`);
    }
  }

  // Invoice: created as a draft then sent, so the numbering trigger runs for real.
  let invoiceId;
  {
    const { data: found } = await db
      .from('invoices').select('id, status, invoice_number')
      .eq('company_id', company.id).eq('project_id', projectId).maybeSingle();
    if (found) {
      invoiceId = found.id;
      note(`invoice ${tag}`, 'exists', `${found.id} (${found.invoice_number ?? found.status})`);
    } else {
      const { data: draft, error } = await db
        .from('invoices')
        .insert({
          company_id: company.id, project_id: projectId, author_member_id: ownerMemberId,
          title: name, presentation_level: 'lump_sum',
        })
        .select('id').single();
      must(`invoice draft ${tag}`, error);
      invoiceId = draft.id;

      must(`invoice line ${tag}`, (await db.from('invoice_lines').insert({
        company_id: company.id, invoice_id: invoiceId, line_type: 'fixed',
        description: `QA ${tag} fixture work`, billed_amount: 8000, sort_order: 0,
      })).error);

      must(`invoice totals ${tag}`, (await db.from('invoices').update({
        derived_total: 0, billed_total: 8000, retainage_withheld: 0, amount_receivable: 8000,
      }).eq('id', invoiceId)).error);

      must(`invoice send ${tag}`, (await db.from('invoices').update({
        status: 'sent', sent_at: new Date().toISOString(), issue_date: '2026-08-02',
      }).eq('id', invoiceId)).error);

      const { data: sent } = await db.from('invoices').select('invoice_number').eq('id', invoiceId).single();
      note(`invoice ${tag}`, 'CREATED', `${invoiceId} (${sent.invoice_number})`);
    }
  }

  const paymentId = await ensureRow(
    `client payment ${tag}`, 'client_payments',
    { company_id: company.id, contact_id: contactId },
    {
      company_id: company.id, contact_id: contactId,
      payment_date: '2026-08-02', amount: 3000, method: 'check',
      note: `QA ${tag} isolation fixture`,
    }
  );

  await ensureRow(
    `payment application ${tag}`, 'client_payment_applications',
    { company_id: company.id, payment_id: paymentId },
    { company_id: company.id, payment_id: paymentId, invoice_id: invoiceId, amount: 3000 }
  );

  await ensureRow(
    `expense ${tag}`, 'expenses',
    { company_id: company.id, supplier: `QA ${tag} Supply Co` },
    {
      company_id: company.id, project_id: projectId, author_member_id: ownerMemberId,
      supplier: `QA ${tag} Supply Co`, expense_date: '2026-08-02', amount: 1250,
      cost_category: 'material', state: 'actual', status: 'approved',
    }
  );

  await ensureRow(
    `member pay rate ${tag}`, 'member_pay_rates',
    { company_id: company.id, member_id: ownerMemberId },
    {
      company_id: company.id, member_id: ownerMemberId,
      hourly_rate: 77, effective_date: '2026-01-01',
    }
  );

  return projectId;
}

const aOwnerProfile = (await db.from('profiles').select('id').eq('email', COMPANY_A_IDENTITIES[0].email).single()).data;
const aProjectId = await seedIsolationFixtures(companyA, 'A', await memberIdFor(aOwnerProfile.id));
await seedIsolationFixtures(companyB, 'B', bOwnerMemberId);

// ── Role-check assignments ──────────────────────────────────────────────────
//
// PM, foreman and crew are ASSIGNED to company A's fixture project so the role
// harness has a project every role can legitimately reach. That matters: it
// makes a refusal attributable to the ROLE rather than to a missing assignment,
// which is a weaker and less interesting proof.
//
// Owner and Admin need no assignment — can_view_project() lets them see every
// project in the company.
console.log('\nRole-check assignments on company A fixture project:');
for (const { email, role } of COMPANY_A_IDENTITIES) {
  if (role === 'owner' || role === 'admin') continue;
  const { data: profile } = await db.from('profiles').select('id').eq('email', email).single();
  const memberId = await memberIdFor(profile.id);
  await ensureRow(
    `assignment ${role}`, 'project_assignments',
    { project_id: aProjectId, member_id: memberId },
    { company_id: companyA.id, project_id: aProjectId, member_id: memberId, role_on_project: role }
  );
}

// ── summary ─────────────────────────────────────────────────────────────────
const created = log.filter((l) => l.status === 'CREATED').length;
console.log(`\n${created} created, ${log.length - created} already present.\n`);
console.log(`Company A: ${companyA.id}`);
console.log(`Company B: ${companyB.id}`);
console.log(`Shared password for all test identities: ${TEST_PASSWORD}`);
console.log('(documented in STATE.md → Test Data; rebuild-test only, never production)\n');
