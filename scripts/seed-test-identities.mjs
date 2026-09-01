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

const COMPANY_A_NAME = 'Sabal Point Construction';
const COMPANY_B_NAME = 'Ridgeline Builders (TEST CO 2)';
const COMPANY_B_SLUG = 'ridgeline-test-co-2';

/** Company A — every role FrameFocus gates on. */
const COMPANY_A_IDENTITIES = [
  { email: 'josh+test50@worthprop.com', role: 'owner', first: 'Dave', last: 'Whitfield' },
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
    // Reconcile the crew member's display_name to the seeded name. display_name
    // is set ONCE by create_member_for_new_profile and has NO sync trigger (F-6),
    // so a profile renamed AFTER its member row was created — e.g. the S176
    // fixture rename that left josh+test50 showing "Josh Bishop" while the profile
    // read "Dave Whitfield" — leaves display_name stale, and display_name is the
    // field 30+ readers show (register 1.2). Subcontractor members intentionally
    // carry company_name, so this is crew/staff only. Idempotent: only writes on
    // an actual mismatch.
    if (role !== 'client' && role !== 'subcontractor') {
      const { error: rErr } = await db
        .from('company_members')
        .update({ display_name: `${first} ${last}` })
        .eq('profile_id', existing.id)
        .neq('display_name', `${first} ${last}`);
      must(`reconcile display_name(${email})`, rErr);
    }
    note(`identity ${email}`, 'exists', `role=${existing.role}, password set`);
    return existing;
  }

  const { data: created, error: uErr } = await db.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  must(`createUser(${email})`, uErr);

  // ⚠️ ADOPT THE TRIGGER'S PROFILE — DO NOT INSERT ONE [S135].
  //
  // _Superseded, quoted rather than rewritten:_
  // ```
  // const { data: profile, error: pErr } = await db.from('profiles').insert({
  //   user_id: created.user.id, company_id: companyId, email, ... });
  // ```
  //
  // `20260914000000` brought the `on_auth_user_created` trigger into version
  // control. It has ALWAYS existed on production and NEVER existed on
  // rebuild-test, which is the only reason this script could insert a profile
  // by hand — `profiles_user_id_key` now refuses the second row.
  //
  // A tokenless createUser takes the OWNER path, so it leaves a company, a
  // trialing subscription, a `trial_emails` row and a seeded tag set behind.
  // Repoint the profile and delete the rest — `trial_emails` especially, since
  // leaving it silently denies a real trial to that address later.
  //
  // Mirrors `apps/web/test/live-session.ts:adoptSignupProfile()`, which the live
  // harnesses use for the same reason. Kept as its own copy because this file is
  // plain .mjs and cannot import the TypeScript helper.
  const { data: auto, error: aErr } = await db
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', created.user.id)
    .single();
  must(`auto-profile(${email})`, aErr);

  const spuriousCompanyId = auto.company_id;

  const { data: profile, error: pErr } = await db
    .from('profiles')
    .update({ company_id: companyId, role, first_name: first, last_name: last })
    .eq('id', auto.id)
    .select('id, user_id, role')
    .single();
  must(`profile(${email})`, pErr);

  // `profiles_create_member` made the member row in the spurious company.
  //
  // ⚠️ BUT NOT FOR A CLIENT OR A SUBCONTRACTOR — DELETE IT INSTEAD [S164].
  //
  // `create_member_for_new_profile()` opens with
  // `IF NEW.role IN ('client','subcontractor') THEN RETURN NEW; END IF;`, so
  // neither role is supposed to have a member row at all. It fires anyway here,
  // because a tokenless `createUser()` takes `handle_new_user()`'s OWNER path:
  // the profile is INSERTed as `owner` and only becomes a client in the UPDATE
  // above. The trigger sees `owner`, makes a `crew` member row, and the line
  // below then carried it into the REAL company.
  //
  // ⚠️ WHY THIS IS NOT COSMETIC. `get_my_member_id()` selects through
  // `company_members`, so a client holding one stops being refused by absence —
  // and M9's entire identity ruling [Josh, S164 Q1] rests on clients having NO
  // member row. Measured at S164: a client with a member row plus a project
  // assignment satisfies 21 policies across 18 tables that no client rule
  // mentions, six of them WRITES including `punch_lists`, which R14 rules NO.
  // It also silently invalidates the counterfactual in
  // `s164-m9-client-identity.live.ts` — the identity would be reachable for a
  // reason that has nothing to do with the policy under test.
  //
  // Caught by that file's A2 the first time this path created a client.
  if (role === 'client' || role === 'subcontractor') {
    const { data: spurious, error: dErr } = await db
      .from('company_members').delete().eq('profile_id', auto.id).select('id');
    must(`drop spurious member row(${email})`, dErr);
    if (spurious.length) note(`spurious member row ${email}`, 'DELETED', spurious[0].id);
  } else {
    // Set company_id AND reconcile display_name to the seeded name. The
    // create_member_for_new_profile trigger set display_name from the profile
    // name at member-creation, which for a tokenless createUser runs BEFORE
    // first/last are populated (the OWNER path) — so it can land as the email.
    // F-6: no sync trigger, so fix it here. Crew/staff only (subs keep
    // company_name; clients have no member row — handled above).
    await db
      .from('company_members')
      .update({ company_id: companyId, display_name: `${first} ${last}` })
      .eq('profile_id', auto.id);
  }

  if (spuriousCompanyId && spuriousCompanyId !== companyId) {
    await db.from('tag_options').delete().eq('company_id', spuriousCompanyId);
    await db.from('subscriptions').delete().eq('company_id', spuriousCompanyId);
    await db.from('companies').delete().eq('id', spuriousCompanyId);
  }
  await db.from('trial_emails').delete().eq('email', email.toLowerCase());

  note(`identity ${email}`, 'CREATED', `role=${role} (adopted from the signup trigger)`);
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

// ── Company A billing subscription — what the Billing settings tab reads ──────
//
// Sabal Point has an Owner but no `subscriptions` row: the row `handle_new_user`
// creates during a tokenless owner `createUser` belongs to the SPURIOUS auto-company
// and is deleted with it (`ensureIdentity`, above, line ~195). So the settings
// Billing tab — gated on `if (subscription)` in settings/page.tsx, with
// getSubscription() returning NULL (not throwing) — never rendered, and
// desktop-settings-billing.spec.ts's three OWNER tests failed while the three ADMIN
// tests passed (an admin never gets the tab regardless).
//
// One active Professional subscription fixes it AND matches the fixture's resting
// state. trial-fixture.ts KEEPS Sabal Point unlocked and non-`incomplete` on purpose
// (its header: a locked or incomplete shared company bounces EVERY QA identity to
// /locked or /trial-limit), so `active` is the only status consistent with that —
// and it renders a clean, screenshot-plausible tab (Active · Professional — $100/mo ·
// 7-seat plan). No stripe_subscription_id: there is no real Stripe customer behind
// the fixture, and a dead "Manage Subscription" button is worse than its absence.
// Idempotent via ensureRow (matches on the UNIQUE company_id).
await ensureRow(
  'company A subscription (billing tab)',
  'subscriptions',
  { company_id: companyA.id },
  {
    company_id: companyA.id,
    plan_tier: 'professional',
    status: 'active',
    seat_limit: 7,
    stripe_subscription_id: null,
    trial_start: null,
    trial_end: null,
    current_period_start: new Date(Date.now() - 15 * 86_400_000).toISOString(),
    current_period_end: new Date(Date.now() + 15 * 86_400_000).toISOString(),
    cancel_at_period_end: false,
  }
);

// ── Company B (#104) ────────────────────────────────────────────────────────
console.log('\nCompany B (cross-company isolation):');
// ⚠️ MATCH ON SLUG **OR** NAME [S164]. Matching on slug alone silently created a
// SECOND company B: the live row's slug is `ridgeline-builders-test-co-2` and
// this file's constant is `ridgeline-test-co-2`, so the lookup missed and the
// insert below ran against a tenant that already existed. A duplicate tenant is
// the worst possible outcome for a script whose entire purpose is proving
// cross-tenant isolation — the two halves of every isolation assertion end up
// in different companies and both pass. Found and reverted at S164.
let { data: companyB } = await db.from('companies').select('id, name, slug').eq('slug', COMPANY_B_SLUG).maybeSingle();
if (!companyB) {
  const { data: byName } = await db
    .from('companies').select('id, name, slug').eq('name', COMPANY_B_NAME).maybeSingle();
  if (byName) {
    companyB = byName;
    note('company B slug drift', 'WARN',
      `matched by NAME — live slug is '${byName.slug}', this script expects '${COMPANY_B_SLUG}'. ` +
        'Using the existing company rather than creating a second one.');
  }
}
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
          project_type: 'fixed_price', retainage_percent: 5,
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

  // ⚠️ CONTRACT VALUE IS NOT ON `projects` AND HAS NOT BEEN SINCE
  // `20260812000000_drop_projects_contract_value.sql` [S164].
  //
  // This insert carried `contract_value: 50000` until S164, so the moment a
  // company's project had to be CREATED rather than found, the whole script
  // died with "Could not find the 'contract_value' column of 'projects'".
  // Company A's project already existed, so the failure only ever surfaced on
  // company B — i.e. only on a rebuild, which is exactly when this script is
  // the thing you are relying on.
  //
  // The Financial Visibility Floor moved the column to `project_financials`
  // (1:1 off `projects`, Owner/Admin-only by RLS — the service role used here
  // bypasses that). Company A's fixture already carries 50000 via the
  // conversion migration's backfill, so company B must match or the two
  // isolation sets are no longer comparable.
  await ensureRow(
    `project financials ${tag}`, 'project_financials',
    { project_id: projectId },
    { company_id: company.id, project_id: projectId, contract_value: 50000 }
  );

  // Invoice: created as a draft then sent, so the numbering trigger runs for real.
  let invoiceId;
  {
    // ⚠️ NOT `.maybeSingle()` — it was, and the script was NOT idempotent [S113].
    // `maybeSingle()` treats "more than one row" as an ERROR and returns
    // `data: null`. This destructure ignores `error`, so the moment a second
    // fixture invoice existed the lookup reported "none found" and created a
    // THIRD — then a fourth, compounding on every run. Four surplus invoices
    // (INV-0178…0181) were created before this was noticed and have been
    // soft-deleted. `limit(1)` + `[0]` is stable whatever the row count.
    const { data: rows } = await db
      .from('invoices').select('id, status, invoice_number')
      .eq('company_id', company.id).eq('project_id', projectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1);
    const found = rows?.[0] ?? null;
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

// ── #127 — the two identities rebuild-test never had [S113] ─────────────────
//
// WHY THESE TWO ARE NOT IN COMPANY_A_IDENTITIES ABOVE. `create_member_for_new_profile()`
// (20260704210000) SKIPS both roles:
//
//     IF NEW.role IN ('client', 'subcontractor') THEN RETURN NEW; END IF;
//
// so neither gets an auto-created company_members row, and ensureIdentity()
// alone would leave a subcontractor with no member id — which is the id
// `assignee_id`, `completed_by` and `get_my_member_id()` all speak in. A sub
// seeded that way looks fine in `profiles` and is invisible to every punch
// query, which is a worse fixture than none.
//
// ⚠️ DO NOT REACH FOR THE 32 EXISTING SUBCONTRACTOR MEMBER ROWS. They are
// ROSTER entries — `profile_id IS NULL`, no auth user, cannot sign in
// (TECH_DEBT #127 says this explicitly and it is the trap this block avoids).
// A member row is not an identity.
//
// The path below is the PRODUCTION path, not a shortcut: handle_new_user()'s
// invite branch inserts the profile and then links it to an existing member row
// with `UPDATE company_members SET profile_id = ... WHERE id = <invite.member_id>
// AND profile_id IS NULL`. We do the same two steps with the service role,
// against a member row created the same way production creates one — by
// inserting a `subcontractors` row and letting `subcontractors_create_member`
// fire. Seeding a member row directly would test a shape production never makes.
console.log('\n#127 — subcontractor and client identities:');

const SUB_EMAIL = 'josh+qa-sub@worthprop.com';
const CLIENT_EMAIL = 'josh+qa-client@worthprop.com';
const SUB_COMPANY_NAME = 'QA Subcontractor Co (TEST IDENTITY)';

// 1. The Module 2 subcontractor, which the trigger turns into a member row.
const subVendorId = await ensureRow(
  'subcontractor record', 'subcontractors',
  { company_id: companyA.id, company_name: SUB_COMPANY_NAME },
  {
    company_id: companyA.id,
    company_name: SUB_COMPANY_NAME,
    sub_type: 'subcontractor',
    status: 'active',
    trade_type: 'Framing',
    email: SUB_EMAIL,
  }
);

// 2. Its member row — created by `subcontractors_create_member`, not by us.
const { data: subMember } = await db
  .from('company_members')
  .select('id, profile_id, display_name')
  .eq('company_id', companyA.id)
  .eq('member_type', 'subcontractor')
  .eq('display_name', SUB_COMPANY_NAME)
  .maybeSingle();
if (!subMember) {
  throw new Error(
    `subcontractors_create_member did not fire for ${SUB_COMPANY_NAME} (subcontractors.id=${subVendorId}) — ` +
      'no company_members row to link an identity to.'
  );
}
note('subcontractor member row', 'exists', `${subMember.id} (via trigger)`);

// 3. The auth user + profile. ensureIdentity() creates no member row for this
//    role, which is why step 4 exists.
const subProfile = await ensureIdentity(
  { email: SUB_EMAIL, role: 'subcontractor', first: 'QA', last: 'Sub A' },
  companyA.id
);

// 4. The link — handle_new_user()'s invite branch, done by hand.
if (subMember.profile_id === subProfile.id) {
  note('sub profile ↔ member link', 'exists', subMember.id);
} else if (subMember.profile_id) {
  throw new Error(
    `member ${subMember.id} is already linked to a DIFFERENT profile (${subMember.profile_id}); refusing to steal it.`
  );
} else {
  must('link sub member', (await db.from('company_members')
    .update({ profile_id: subProfile.id })
    .eq('id', subMember.id)
    .is('profile_id', null)).error);
  note('sub profile ↔ member link', 'CREATED', `${subMember.id} -> ${subProfile.id}`);
}

// 5. Assign the sub to the fixture project.
//    THIS IS WHAT MAKES D-57 A NARROWING RATHER THAN A NO-OP. `can_view_project()`
//    is `owner/admin OR is_assigned_to_project()`, and that second arm is
//    ROLE-BLIND — so an assigned sub currently satisfies the FIRST arm of
//    `punch_list_items_select_visible` and sees every punch item on the project.
//    Without this row the sub sees nothing either way and the migration would
//    prove nothing.
await ensureRow(
  'assignment subcontractor', 'project_assignments',
  { project_id: aProjectId, member_id: subMember.id },
  {
    company_id: companyA.id, project_id: aProjectId,
    member_id: subMember.id, role_on_project: 'subcontractor',
  }
);

// 5b. Assign the sub to the project the BROWSER suite drives [S114].
//
//     A-33c ("no money on M-13 under ANY role") walks all six roles against
//     e2e/m-sections.spec.ts's PROJECT_ID, which is NOT the isolation fixture
//     above. The subcontractor arm of that criterion was skipped on #127
//     grounds; #127 is closed, but simply unskipping it would have produced a
//     VACUOUS PASS — an unassigned sub fails `can_view_project()`, reaches the
//     screen with nothing on it, and "renders no currency" is then true of an
//     empty page.
//
//     ⚠️ A-33c IS THE CRITERION THAT MOST NEEDS A REAL ROW SET. TECH_DEBT #117
//     rules `change_orders_select_visible` UI-only — company + can_view_project,
//     no role floor — so RLS hands a sub every CO on a project they are on, at
//     full `net_delta`. Nothing but the UI keeps those dollars off the screen.
//     The assertion is therefore only worth running against a sub who can
//     actually read the change orders, and this row is what makes that true.
//     That project carries 2 non-deleted COs; the isolation fixture carries 0,
//     which is why the fixture project could not be used instead.
const SECTIONS_PROJECT_ID = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
{
  const { data: sectionsProject } = await db
    .from('projects').select('id, company_id').eq('id', SECTIONS_PROJECT_ID).maybeSingle();
  if (!sectionsProject) {
    note('assignment sub → m-sections project', 'WARN',
      `${SECTIONS_PROJECT_ID} not found — e2e/m-sections.spec.ts PROJECT_ID has moved; A-33c's sub arm will be vacuous`);
  } else if (sectionsProject.company_id !== companyA.id) {
    throw new Error(
      `m-sections PROJECT_ID ${SECTIONS_PROJECT_ID} belongs to company ${sectionsProject.company_id}, not company A — refusing to cross tenants.`
    );
  } else {
    await ensureRow(
      'assignment sub → m-sections project', 'project_assignments',
      { project_id: SECTIONS_PROJECT_ID, member_id: subMember.id },
      {
        company_id: companyA.id, project_id: SECTIONS_PROJECT_ID,
        member_id: subMember.id, role_on_project: 'subcontractor',
      }
    );

    // ── TECH_DEBT #143 [S119] — EVERY FIELD ROLE, NOT JUST THE SUB ─────────
    //
    // The sub got its row at S114 for A-33c; PM and crew already had one from
    // the project's own assignments. **The foreman never did**, and because
    // `can_view_project()` is what gates `change_orders_select_visible` and
    // `getProject()`, that identity saw an EMPTY M-13 and got a 404 on M-33.
    //
    // ⚠️ THE COST WAS NOT THE 404. It was that every assertion of the form
    // "the foreman does NOT see X" passed VACUOUSLY — for the wrong reason,
    // silently. #127 was the same class of gap and at least failed loudly.
    // Found only because M6M Part C's suite failed 5/21 on it [S117].
    //
    // Seeded for ALL THREE rather than just the foreman, so the set is uniform
    // and the next identity added here does not inherit the same silent hole.
    // `ensureRow` matches on (project_id, member_id), so the two that already
    // have rows are left exactly as they are.
    for (const { email, role } of COMPANY_A_IDENTITIES) {
      if (role === 'owner' || role === 'admin') continue; // reach every project already
      const { data: p } = await db.from('profiles').select('id').eq('email', email).single();
      const memberId = await memberIdFor(p.id);
      await ensureRow(
        `assignment ${role} → m-sections project`, 'project_assignments',
        { project_id: SECTIONS_PROJECT_ID, member_id: memberId },
        {
          company_id: companyA.id, project_id: SECTIONS_PROJECT_ID,
          member_id: memberId, role_on_project: role,
        }
      );
    }
  }
}

// 6. The client. NO member row, deliberately — `create_member_for_new_profile()`
//    skips 'client' because a client is not assignable to work, and a client
//    identity exists to exercise the `get_my_role() <> 'client'` arms that
//    `files_select_non_client` and its three siblings are built on.
await ensureIdentity(
  { email: CLIENT_EMAIL, role: 'client', first: 'QA', last: 'Client A' },
  companyA.id
);
{
  const { data: strayMember } = await db
    .from('company_members').select('id')
    .eq('company_id', companyA.id).eq('display_name', 'QA Client A').maybeSingle();
  note(
    'client has no member row (correct)',
    strayMember ? 'WARN' : 'exists',
    strayMember ? `unexpected member ${strayMember.id}` : 'as create_member_for_new_profile intends'
  );
}

// ── M9 stage 1 [S164] — THE LINKED CLIENT, AND WHY THERE MUST BE TWO ────────
//
// `9-spec.md` §2 is the reason this block exists, and it is the single highest
// risk in Module 9:
//
//   > every existing "client reads 0" probe passes VACUOUSLY. A client is
//   > refused today by the ABSENCE OF A MEMBER ROW, not by any client rule.
//
// So "the client read 0 rows" proves nothing on its own. It is true of that
// identity for EVERY table, under every policy, correct or not. A probe that
// would pass against a client who does not exist is not a test.
//
// ⚠️ THE FIX IS TWO IDENTITIES, NOT ONE. `josh+qa-client@` above stays exactly
// as it is — UNLINKED, `contact_id IS NULL` — and becomes the CONTROL. The
// identity below is LINKED to the fixture project's contact. Every M9 policy
// arm is then proved in both directions on the same query:
//
//     linked client   -> reads the row      (the grant works)
//     unlinked client -> reads nothing      (refused BY RULE, not by absence)
//
// Neither half is worth anything alone. One says a grant exists; the other says
// it is a grant and not a hole. This is the condition Josh set for building M9
// straight through instead of stopping to build a fixture first [S164 Q7].
//
// Noted against TECH_DEBT #149, which already records this script as
// hand-curated and unreproducible.
console.log('\nM9 stage 1 — the linked client principal:');

const CLIENT_LINKED_EMAIL = 'josh+qa-client-linked@worthprop.com';

// The fixture project's own contact — `seedIsolationFixtures` created it and
// `projects.contact_id` already points at it, which is arm (a) of
// `is_client_of_project()`.
const { data: fixtureContact } = await db
  .from('contacts').select('id')
  .eq('company_id', companyA.id).eq('last_name', 'ClientA').maybeSingle();
if (!fixtureContact) {
  throw new Error('contact ClientA not found in company A — seedIsolationFixtures did not run.');
}

// TWO addresses on ONE contact, and the second one is the entire point.
//
// ⚠️ A SITE ADDRESS AND A HOME ADDRESS, so the grant can be proved to be a
// GRANT AND NOT A DOOR. `my_client_site_address_ids()` resolves through
// `projects.contact_address_id`, so it must return the site and must NOT return
// the home — and with only one address seeded, a policy that wrongly unlocked
// the whole contact's address list would pass identically. This is the same
// trap `20261006000000` (the S154 sub grant) called out and fixtured against.
const siteAddressId = await ensureRow(
  'client site address', 'contact_addresses',
  { contact_id: fixtureContact.id, label: 'Job site' },
  {
    company_id: companyA.id, contact_id: fixtureContact.id,
    label: 'Job site', address_line1: '400 QA Site Way',
    city: 'Springfield', state: 'IL', zip: '62701', is_primary: false,
  }
);
const homeAddressId = await ensureRow(
  'client HOME address (must stay hidden)', 'contact_addresses',
  { contact_id: fixtureContact.id, label: 'Home' },
  {
    company_id: companyA.id, contact_id: fixtureContact.id,
    label: 'Home', address_line1: '9 QA Private Residence Rd',
    city: 'Springfield', state: 'IL', zip: '62704', is_primary: true,
  }
);

// Point the fixture project at the SITE address only.
{
  const { data: proj } = await db
    .from('projects').select('contact_address_id').eq('id', aProjectId).single();
  if (proj.contact_address_id === siteAddressId) {
    note('fixture project site address', 'exists', siteAddressId);
  } else {
    must('set fixture project site address', (await db.from('projects')
      .update({ contact_address_id: siteAddressId })
      .eq('id', aProjectId)).error);
    note('fixture project site address', 'CREATED', `${aProjectId} -> ${siteAddressId}`);
  }
}

// The identity itself. No member row — `create_member_for_new_profile()` skips
// 'client', which is exactly the property Q1's ruling rests on.
const linkedClientProfile = await ensureIdentity(
  { email: CLIENT_LINKED_EMAIL, role: 'client', first: 'QA', last: 'Client Linked' },
  companyA.id
);

// ⚠️ ENFORCE "NO MEMBER ROW" ON EVERY RUN, not just on the run that creates the
// identity. `ensureIdentity()` returns EARLY when the profile already exists,
// so its own guard above never re-checks an identity seeded by an older version
// of this script — and one was: the first S164 run produced a `crew` member row
// for the linked client and `s164-m9-client-identity.live.ts` A2 caught it.
//
// This block is the repair AND the standing invariant. It is cheap and it runs
// every time, because the property it protects is the one M9's identity ruling
// is built on.
for (const email of [CLIENT_LINKED_EMAIL, CLIENT_EMAIL]) {
  const { data: prof } = await db.from('profiles').select('id').eq('email', email).single();
  const { data: strays, error: sErr } = await db
    .from('company_members').delete().eq('profile_id', prof.id).select('id');
  must(`clear member rows(${email})`, sErr);
  note(
    `client has no member row — ${email}`,
    strays.length ? 'REPAIRED' : 'exists',
    strays.length ? `deleted ${strays.length} (get_my_member_id() must return NULL)` : 'none, as required'
  );
}

// The link. Requires `20261016000000_m9_client_identity.sql` to be pushed
// first — if it has not been, say so plainly rather than failing on an unknown
// column three steps later.
{
  const { error: linkErr } = await db
    .from('profiles')
    .update({ contact_id: fixtureContact.id })
    .eq('id', linkedClientProfile.id)
    .is('contact_id', null);
  if (linkErr && /contact_id/.test(linkErr.message)) {
    throw new Error(
      'profiles.contact_id does not exist yet — push ' +
        '20261016000000_m9_client_identity.sql before seeding. Original: ' + linkErr.message
    );
  }
  must('link client profile -> contact', linkErr);
  note('client profile ↔ contact link', 'ok', `${linkedClientProfile.id} -> ${fixtureContact.id}`);
}

// Arm (b) of `is_client_of_project()` — R3's "several contacts per project".
//
// ⚠️ SEEDED ON A DIFFERENT PROJECT ON PURPOSE. On the fixture project the
// client already qualifies through `projects.contact_id`, so a `project_contacts`
// row there would prove nothing — arm (a) would carry the assertion and arm (b)
// could be deleted without a single test going red. The m-sections project's
// `contact_id` is a DIFFERENT contact (Bishop), so it is reachable through arm
// (b) and through nothing else.
{
  const { data: sectionsProject } = await db
    .from('projects').select('id, company_id, contact_id')
    .eq('id', SECTIONS_PROJECT_ID).maybeSingle();
  if (!sectionsProject) {
    note('client → m-sections project_contacts', 'WARN',
      `${SECTIONS_PROJECT_ID} not found — arm (b) of is_client_of_project() will be untested`);
  } else if (sectionsProject.contact_id === fixtureContact.id) {
    note('client → m-sections project_contacts', 'WARN',
      'm-sections project.contact_id IS the fixture contact — arm (b) is no longer isolated by this fixture');
  } else {
    await ensureRow(
      'client → m-sections project_contacts', 'project_contacts',
      { project_id: SECTIONS_PROJECT_ID, contact_id: fixtureContact.id },
      {
        company_id: companyA.id, project_id: SECTIONS_PROJECT_ID,
        contact_id: fixtureContact.id, role: 'client',
      }
    );
  }
}

// The control must STAY unlinked. If some later edit links it, every
// "refused by rule" assertion in the M9 suite silently becomes vacuous again —
// in the other direction this time, which is harder to notice.
{
  const { data: control } = await db
    .from('profiles').select('id, contact_id').eq('email', CLIENT_EMAIL).single();
  note(
    'control client is UNLINKED (required)',
    control.contact_id ? 'WARN' : 'exists',
    control.contact_id
      ? `contact_id=${control.contact_id} — the M9 counterfactual is COMPROMISED`
      : 'contact_id IS NULL, as the counterfactual requires'
  );
}
note('M9 addresses', 'exists', `site=${siteAddressId} home=${homeAddressId} (home must never be readable)`);

// ── M9 stage 2 [S164] — THE LIFECYCLE FIXTURES ──────────────────────────────
//
// R5 is an ACCOUNT-level rule and the obvious per-project reading of it is
// wrong, so the fixtures have to be able to tell the two apart:
//
//   > Login deactivates 45 days after completion ... On reactivation she sees
//   > old projects IN FULL — nothing narrows with age. No standing archive
//   > access without an active project.
//
// One long-completed project, shared by two clients, proves both halves:
//
//   LINKED client  — also has ACTIVE projects -> account live -> she SEES the
//                    old one. ("nothing narrows with age")
//   CLOSED client  — has nothing else         -> account dark -> she sees
//                    NOTHING. ("no standing archive access")
//
// ⚠️ Same query, same project, opposite answers, and the ONLY difference is
// what else the account holds. A per-project implementation of the window
// passes the second and fails the first — which is why the old project is
// deliberately shared rather than given to the closed client alone.
console.log('\nM9 stage 2 — lifecycle fixtures:');

const CLIENT_CLOSED_EMAIL = 'josh+qa-client-closed@worthprop.com';

const closedContactId = await ensureRow(
  'contact for the closed-window client', 'contacts',
  { company_id: companyA.id, last_name: 'ClientClosed' },
  {
    company_id: companyA.id, contact_type: 'client',
    first_name: 'QA', last_name: 'ClientClosed',
    email: 'qa-client-closed@example.invalid',
  }
);

// A contact with NO email — the §S.1 refusal has nothing to refuse without it.
const noEmailContactId = await ensureRow(
  'contact with NO email (§S.1 refusal fixture)', 'contacts',
  { company_id: companyA.id, last_name: 'ClientNoEmail' },
  {
    company_id: companyA.id, contact_type: 'client',
    first_name: 'QA', last_name: 'ClientNoEmail',
    email: null,
  }
);

// The completed project. 200 days past its end date, so it is far outside the
// 45-day window under any reading and no test depends on today's date.
const CLOSED_PROJECT_NAME = 'QA A — M9 completed 200d';
let closedProjectId;
{
  const { data: found } = await db
    .from('projects').select('id')
    .eq('company_id', companyA.id).eq('name', CLOSED_PROJECT_NAME).maybeSingle();
  if (found) {
    closedProjectId = found.id;
    note('closed-window project', 'exists', found.id);
  } else {
    const { data: counters } = await db
      .from('companies')
      .select('estimate_number_sequence, project_internal_sequence')
      .eq('id', companyA.id).single();
    const seq = counters.estimate_number_sequence + 1;
    const internal = counters.project_internal_sequence + 1;
    const { data, error } = await db
      .from('projects')
      .insert({
        company_id: companyA.id, name: CLOSED_PROJECT_NAME, contact_id: closedContactId,
        project_type: 'fixed_price', retainage_percent: 5,
        project_number: `PRJ-${String(seq).padStart(3, '0')}`,
        project_internal_seq: internal,
        status: 'complete',
      })
      .select('id').single();
    must('closed-window project', error);
    closedProjectId = data.id;
    must('counters after closed project', (await db.from('companies').update({
      estimate_number_sequence: seq, project_internal_sequence: internal,
    }).eq('id', companyA.id)).error);
    note('closed-window project', 'CREATED', data.id);
  }
}

// The end date is re-asserted every run rather than only on creation: it is
// RELATIVE to today, and a fixture written once would drift back inside the
// window as time passed and quietly stop testing anything.
{
  const twoHundredDaysAgo = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
  const { data: cur } = await db
    .from('projects').select('actual_end_date, status').eq('id', closedProjectId).single();
  if (cur.actual_end_date !== twoHundredDaysAgo || cur.status !== 'complete') {
    must('closed project end date', (await db.from('projects')
      .update({ status: 'complete', actual_end_date: twoHundredDaysAgo })
      .eq('id', closedProjectId)).error);
    note('closed project end date', 'SET', `${twoHundredDaysAgo} (200 days ago, status=complete)`);
  } else {
    note('closed project end date', 'exists', twoHundredDaysAgo);
  }
}

// The LINKED client is on the old project too — this is the "sees old projects
// in full" half, and without this row that half is untested.
await ensureRow(
  'linked client → closed project (R5: old projects in full)', 'project_contacts',
  { project_id: closedProjectId, contact_id: fixtureContact.id },
  {
    company_id: companyA.id, project_id: closedProjectId,
    contact_id: fixtureContact.id, role: 'client',
  }
);

const closedClientProfile = await ensureIdentity(
  { email: CLIENT_CLOSED_EMAIL, role: 'client', first: 'QA', last: 'Client Closed' },
  companyA.id
);
{
  const { error: linkErr } = await db
    .from('profiles')
    .update({ contact_id: closedContactId })
    .eq('id', closedClientProfile.id)
    .is('contact_id', null);
  must('link closed client → contact', linkErr);
  note('closed client ↔ contact link', 'ok', `${closedClientProfile.id} -> ${closedContactId}`);
}

// Same invariant as the other two clients — no member row, ever.
{
  const { data: strays, error: sErr } = await db
    .from('company_members').delete().eq('profile_id', closedClientProfile.id).select('id');
  must(`clear member rows(${CLIENT_CLOSED_EMAIL})`, sErr);
  note(
    `client has no member row — ${CLIENT_CLOSED_EMAIL}`,
    strays.length ? 'REPAIRED' : 'exists',
    strays.length ? `deleted ${strays.length}` : 'none, as required'
  );
}

// Every client starts 'active'; R17 tests set and restore it themselves. If a
// previous run died mid-test, this puts them back.
for (const email of [CLIENT_LINKED_EMAIL, CLIENT_EMAIL, CLIENT_CLOSED_EMAIL]) {
  const { data: restored } = await db
    .from('profiles').update({ client_access_state: 'active' })
    .eq('email', email).neq('client_access_state', 'active').select('id');
  if (restored?.length) note(`client_access_state ${email}`, 'REPAIRED', 'reset to active');
}

note('M9 lifecycle fixtures', 'exists',
  `closedProject=${closedProjectId} closedContact=${closedContactId} noEmailContact=${noEmailContactId}`);

// ── M9 stage 3 [S164] — READ-SURFACE FIXTURES ───────────────────────────────
//
// Every client read arm needs BOTH halves present, or its probe passes for the
// wrong reason:
//
//   the row she MAY see      -> proves the arm grants
//   a row she MAY NOT see    -> proves the arm is an arm and not an open door
//
// A probe against an empty table passes vacuously, and 4 of the 5 existing
// fixture files had no storage object at all — so a storage assertion against
// them would have proved nothing either.
console.log('\nM9 stage 3 — read-surface fixtures:');

// ⚠️ REAL STORAGE OBJECTS, NOT JUST `files` ROWS. The markup-derivative branch
// of the storage policy is the one thing that cannot be tested without bytes in
// the bucket: an annotated photo is ONE `files` row plus a flattened derivative
// at `<path>.markup.jpg` with NO row of its own, so a policy missing that branch
// serves the row and 403s the image. That failure looks like a broken image
// rather than a policy gap, which is exactly why it is fixtured.
const ONE_PX_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB' +
    'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AACwgAAQABAQERAP/EABQAAQAAAAAAAAAA' +
    'AAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAA/AD8A/9k=',
  'base64'
);

async function ensureObject(path, bytes) {
  const { data: existing } = await db.storage
    .from('project-files')
    .list(path.split('/').slice(0, -1).join('/'), { search: path.split('/').pop() });
  if (existing?.length) {
    note(`storage object ${path.split('/').pop()}`, 'exists', `${bytes.length}b`);
    return;
  }
  const { error } = await db.storage
    .from('project-files')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  must(`upload ${path}`, error);
  note(`storage object ${path.split('/').pop()}`, 'CREATED', `${bytes.length}b`);
}

const visiblePhotoPath = `${companyA.id}/${aProjectId}/qa-m9-visible.jpg`;
const hiddenPhotoPath = `${companyA.id}/${aProjectId}/qa-m9-hidden.jpg`;

await ensureObject(visiblePhotoPath, ONE_PX_JPEG);
// The derivative. Deterministic path, exactly as `saveMarkup()` writes it.
await ensureObject(`${visiblePhotoPath}.markup.jpg`, ONE_PX_JPEG);
await ensureObject(hiddenPhotoPath, ONE_PX_JPEG);

const visibleFileId = await ensureRow(
  'client-VISIBLE photo', 'files',
  { company_id: companyA.id, file_path: visiblePhotoPath },
  {
    company_id: companyA.id, project_id: aProjectId, category: 'photos',
    file_name: 'qa-m9-visible.jpg', file_path: visiblePhotoPath,
    file_size: ONE_PX_JPEG.length, mime_type: 'image/jpeg',
    client_visible: true, markup_data: { shapes: [] },
  }
);
const hiddenFileId = await ensureRow(
  'client-HIDDEN photo (must stay hidden)', 'files',
  { company_id: companyA.id, file_path: hiddenPhotoPath },
  {
    company_id: companyA.id, project_id: aProjectId, category: 'photos',
    file_name: 'qa-m9-hidden.jpg', file_path: hiddenPhotoPath,
    file_size: ONE_PX_JPEG.length, mime_type: 'image/jpeg',
    client_visible: false,
  }
);
// Re-asserted every run: the flags ARE the test, and a stray edit to either one
// silently turns the pair into two identical halves.
for (const [id, want, label] of [[visibleFileId, true, 'visible'], [hiddenFileId, false, 'hidden']]) {
  const { data: f } = await db.from('files').select('client_visible').eq('id', id).single();
  if (f.client_visible !== want) {
    must(`reset client_visible(${label})`, (await db.from('files')
      .update({ client_visible: want }).eq('id', id)).error);
    note(`client_visible ${label}`, 'REPAIRED', String(want));
  }
}

// A DRAFT of each document type. The existing fixtures are all non-draft, so
// without these "the client cannot see drafts" would be untested.
const ownerMemberIdA = await memberIdFor(aOwnerProfile.id);

// ── Idempotency repair [S167] — THE DRAFT CO IS SIGNABLE FROM THE PRODUCT UI ───
//
// It was signed by accident during the S165 click-test (2026-08-20), and unlike
// every other fixture in this file IT CANNOT BE PUT BACK. Both directions are
// closed, and both were confirmed against the live row before this was written:
//
//   UPDATE  — `enforce_change_order_immutability()` refuses to clear `signed_at`
//             AND `contractor_signed_at` ("A signature stamp cannot be
//             rewritten."), and refuses to restore `net_delta` ("A sent change
//             order is immutable — void and reissue instead."). Service role is
//             no help: it bypasses RLS, not triggers.
//   DELETE  — ⚠️ **STILL TRUE FOR THIS ROW, BUT NO LONGER TRUE IN GENERAL.**
//             _Superseded text, quoted rather than rewritten:_ "`change_order_
//             line_items_change_order_id_fkey` has NO `ON DELETE CASCADE` … A
//             change order that has left draft WITH a line is undeletable by any
//             path — filed as #1-s167fx." **S168 closed #1-s167fx**
//             (`20261023000000`): the CASCADE now exists, and an UNSIGNED change
//             order deletes cleanly, line items and all. This row is SIGNED, and
//             `enforce_change_order_delete_boundary()` refuses a signed change
//             order for every caller including the service role — deliberately,
//             because "being able to prove you never sent one is a claim the
//             system must not be able to make falsely" [Josh, S168]. So the
//             repair below stands for exactly the reason it always did, and for
//             a narrower reason than it was written for.
//
// So the moved row is renamed OUT OF THE WAY — `title` is not frozen — and a
// fresh draft is created below under the canonical title, which keeps
// `s164-m9-read-arms` ARM 4c reading one row by that title. `co_number` IS
// frozen and is UNIQUE per company, so the replacement takes the next free
// `CO-QA-M9-DRAFT-n`; nothing reads `co_number`.
//
// ⚠️ THE STALE LINE NAME SURVIVES. `enforce_co_line_parent_open()` blocks UPDATE
// as well as DELETE, so the superseded CO keeps a line called "QA M9 line on the
// DRAFT co" whose parent is now SIGNED — i.e. legitimately visible to the client.
// That is why ARM 5b is anchored to the parent id and not to that string.
let draftCoNumber = 'CO-QA-M9-DRAFT';
{
  const { data: stuck } = await db
    .from('change_orders').select('id, status, co_number')
    .eq('company_id', companyA.id).eq('title', 'QA M9 — draft CO').maybeSingle();
  if (stuck && stuck.status !== 'draft') {
    const dead = `ZZ SUPERSEDED — QA M9 draft CO (${stuck.co_number}, ${stuck.status} — do not use)`;
    must('rename superseded draft CO', (await db.from('change_orders')
      .update({ title: dead }).eq('id', stuck.id)).error);
    note('QA M9 — draft CO', 'REPAIRED', `left draft (${stuck.status}); renamed to "${dead}" and rebuilt below`);
  }

  // Next free co_number. Only consulted when the row below is actually created.
  const { data: taken } = await db
    .from('change_orders').select('co_number')
    .eq('company_id', companyA.id).like('co_number', 'CO-QA-M9-DRAFT%');
  const used = new Set((taken ?? []).map((r) => r.co_number));
  for (let n = 2; used.has(draftCoNumber); n += 1) draftCoNumber = `CO-QA-M9-DRAFT-${n}`;
}

await ensureRow(
  'DRAFT change order (client must not see)', 'change_orders',
  { company_id: companyA.id, project_id: aProjectId, title: 'QA M9 — draft CO' },
  {
    company_id: companyA.id, project_id: aProjectId,
    co_number: draftCoNumber, title: 'QA M9 — draft CO',
    co_type: 'fixed_price', author_member_id: ownerMemberIdA,
    status: 'draft', pricing_mode: 'markup', net_delta: 1234.56,
  }
);
// Idempotency repair. An earlier run created this CO already SENT, and the
// immutability trigger then refuses to add its line for ever. Drop the row when
// it is sent-but-lineless so the create-draft/add-line/flip sequence below can
// run; a CO that already has its line is left alone.
{
  const { data: co } = await db
    .from('change_orders').select('id, status')
    .eq('company_id', companyA.id).eq('title', 'QA M9 — sent CO').maybeSingle();
  if (co && co.status !== 'draft') {
    const { count } = await db
      .from('change_order_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('change_order_id', co.id);
    if (!count) {
      must('drop lineless sent CO', (await db.from('change_orders').delete().eq('id', co.id)).error);
      note('QA M9 — sent CO', 'REPAIRED', 'dropped (sent with no line) so it can be rebuilt as a draft');
    }
  }
}

await ensureRow(
  'SENT change order (client must see)', 'change_orders',
  { company_id: companyA.id, project_id: aProjectId, title: 'QA M9 — sent CO' },
  {
    company_id: companyA.id, project_id: aProjectId,
    co_number: 'CO-QA-M9-SENT', title: 'QA M9 — sent CO',
    co_type: 'fixed_price', author_member_id: ownerMemberIdA,
    // ⚠️ CREATED AS A DRAFT and flipped below. `change_orders` has a trigger —
    // "Lines of a sent change order are immutable — void and reissue instead" —
    // so a line cannot be added after the flip. Seeding it sent would leave the
    // line-item arm with no visible row to find.
    status: 'draft', pricing_mode: 'markup', net_delta: 2345.67,
  }
);

// A line on each CO. Without both, the line-item arm proves nothing: with only
// a visible parent it cannot show the arm EXCLUDES anything, and with only a
// draft parent it cannot show the arm GRANTS anything.
for (const [coTitle, lineName] of [
  ['QA M9 — sent CO', 'QA M9 line on the SENT co'],
  ['QA M9 — draft CO', 'QA M9 line on the DRAFT co'],
]) {
  const { data: co } = await db
    .from('change_orders').select('id')
    .eq('company_id', companyA.id).eq('title', coTitle).maybeSingle();
  if (!co) continue;
  await ensureRow(
    `line item — ${coTitle}`, 'change_order_line_items',
    { change_order_id: co.id, name: lineName },
    {
      company_id: companyA.id, change_order_id: co.id,
      name: lineName, sort_order: 1, total_price: 100,
    }
  );
}

// Now flip it, with its line already in place.
{
  const { data: co } = await db
    .from('change_orders').select('id, status')
    .eq('company_id', companyA.id).eq('title', 'QA M9 — sent CO').maybeSingle();
  if (co && co.status !== 'sent') {
    must('flip QA M9 CO to sent', (await db.from('change_orders')
      .update({ status: 'sent' }).eq('id', co.id)).error);
    note('QA M9 — sent CO', 'SENT', co.id);
  }
}

await ensureRow(
  'DRAFT client contract (client must not see)', 'client_contracts',
  { company_id: companyA.id, project_id: aProjectId, status: 'draft' },
  { company_id: companyA.id, project_id: aProjectId, status: 'draft' }
);

// A contract_document. `document_kind = 'client_contract'` requires an estimate
// and forbids a sub_contract_id — enforced by a CHECK, so both are supplied.
{
  const { data: tmpl } = await db.from('contract_templates')
    .select('id').eq('company_id', companyA.id).eq('document_kind', 'client_contract').limit(1).maybeSingle();
  const { data: est } = await db.from('estimates')
    .select('id').eq('company_id', companyA.id).limit(1).maybeSingle();
  if (tmpl && est) {
    await ensureRow(
      'SENT contract document (client must see)', 'contract_documents',
      { company_id: companyA.id, project_id: aProjectId, status: 'sent' },
      {
        company_id: companyA.id, project_id: aProjectId,
        template_id: tmpl.id, estimate_id: est.id,
        document_kind: 'client_contract', delivery_mode: 'esignature',
        status: 'sent',
      }
    );
  } else {
    note('contract document fixture', 'WARN', 'no client_contract template or estimate — that arm will be vacuous');
  }
}

note('M9 read fixtures', 'exists',
  `visibleFile=${visibleFileId} hiddenFile=${hiddenFileId} markup=${visiblePhotoPath}.markup.jpg`);

// ── M9 stage 3b [S164] — FINANCIAL FIXTURES ─────────────────────────────────
//
// ⚠️ THE PAIR HERE IS A PRESENTATION LEVEL, NOT AN IDENTITY. `presentation_level`
// is the gate Josh ruled into the DATABASE, and a probe cannot see it work with
// only one level present: every one of the 11 invoices that existed before this
// block is `lump_sum`, so "the client reads no lines" was true of the whole
// table and would have passed against a policy that granted everything.
//
// Three bills on the SAME project, differing only in that column:
//   full_detail  -> lines readable, with cost_basis and unit_rate
//   by_section   -> NO lines; section subtotals only
//   lump_sum     -> NO lines; the total is the whole disclosure
// plus a draft, which is not a bill at all.
console.log('\nM9 stage 3b — financial fixtures:');

// ⚠️ EVERY INVOICE IS CREATED AS A DRAFT AND FLIPPED. `invoice_lines_parent_open`
// refuses a line whose parent invoice has left draft — the same trap as the CO
// immutability trigger above, and it fails the same way: an invoice seeded
// straight to `sent` is an invoice whose line arm can never be tested.
async function ensureInvoice(label, { presentation, status, lines }) {
  const { data: existing } = await db
    .from('invoices').select('id, status, presentation_level')
    .eq('company_id', companyA.id).eq('project_id', aProjectId).eq('title', label).maybeSingle();

  let invoiceId = existing?.id;
  if (!invoiceId) {
    const billed = lines.reduce((n, l) => n + Number(l.billed_amount), 0);
    const derived = lines.reduce((n, l) => n + Number(l.derived_amount ?? l.billed_amount), 0);
    const { data, error } = await db.from('invoices').insert({
      company_id: companyA.id, project_id: aProjectId, title: label,
      author_member_id: ownerMemberIdA, invoice_type: 'standard',
      status: 'draft', presentation_level: presentation,
      issue_date: '2026-08-01', due_date: '2026-08-31',
      derived_total: derived, billed_total: billed, amount_receivable: billed,
      retainage_withheld: 0,
    }).select('id').single();
    must(`invoice ${label}`, error);
    invoiceId = data.id;
    note(`invoice ${label}`, 'CREATED', invoiceId);
  } else {
    note(`invoice ${label}`, 'exists', invoiceId);
  }

  for (const line of lines) {
    await ensureRow(
      `  line — ${label} / ${line.description}`, 'invoice_lines',
      { invoice_id: invoiceId, description: line.description },
      { company_id: companyA.id, invoice_id: invoiceId, ...line }
    );
  }

  const { data: now } = await db.from('invoices').select('status').eq('id', invoiceId).single();
  if (now.status !== status) {
    must(`flip ${label} -> ${status}`,
      (await db.from('invoices').update({ status }).eq('id', invoiceId)).error);
    note(`invoice ${label}`, status.toUpperCase(), invoiceId);
  }
  return invoiceId;
}

// The instrument. T&M, so `unit_rate` on the labor line is an AGREED hourly
// rate and not an arithmetic result — R7a names the agreed figure specifically.
// It hangs off an estimate on HER project so the proposals arm has a subject too.
const tmEstimateId = await ensureRow(
  'M9 T&M estimate (her project)', 'estimates',
  { company_id: companyA.id, estimate_number: 'EST-QA-M9' },
  {
    company_id: companyA.id, estimate_number: 'EST-QA-M9',
    name: 'QA M9 — T&M proposal', project_id: aProjectId,
    contact_id: fixtureContact.id, status: 'sent', contract_type: 'time_and_materials',
    pricing_mode: 'markup', grand_total: 4200, sent_at: '2026-08-01T12:00:00Z',
    created_by_role: 'owner',
  }
);
// The counterfactual for the proposals arm: never sent, so never hers.
await ensureRow(
  'M9 UNSENT estimate (proposals arm must not return it)', 'estimates',
  { company_id: companyA.id, estimate_number: 'EST-QA-M9-UNSENT' },
  {
    company_id: companyA.id, estimate_number: 'EST-QA-M9-UNSENT',
    name: 'QA M9 — unsent proposal', project_id: aProjectId,
    contact_id: fixtureContact.id, status: 'draft', contract_type: 'time_and_materials',
    pricing_mode: 'markup', grand_total: 999, sent_at: null, created_by_role: 'owner',
    internal_notes: 'QA M9 — internal, must never reach a client.',
  }
);

const tmRateId = await ensureRow(
  'M9 instrument rate — the AGREED $95/hr', 'instrument_rates',
  { company_id: companyA.id, estimate_id: tmEstimateId, rate_type: 'tm_labor_hourly' },
  {
    company_id: companyA.id, estimate_id: tmEstimateId,
    rate_type: 'tm_labor_hourly', rate: 95, effective_from: '2026-08-01',
  }
);

// full_detail — she reads the lines, cost basis and all. §4.4's T&M shape:
// what the company paid BESIDE what she is billed.
const fullDetailInvoiceId = await ensureInvoice('QA M9 — full_detail bill', {
  presentation: 'full_detail', status: 'sent',
  lines: [
    {
      sort_order: 1, line_type: 'derived_labor', category: 'labor',
      description: 'QA M9 labor (full_detail)', quantity: 10, unit_rate: 95,
      cost_basis: 640, derived_amount: 950, billed_amount: 950,
      instrument_rate_id: tmRateId,
    },
    {
      sort_order: 2, line_type: 'derived_cost', category: 'material',
      description: 'QA M9 material (full_detail)',
      cost_basis: 500, derived_amount: 600, billed_amount: 600,
    },
  ],
});

// by_section — same two categories, and she must read NEITHER line. The
// subtotals reach her through client_invoice_sections() instead.
const bySectionInvoiceId = await ensureInvoice('QA M9 — by_section bill', {
  presentation: 'by_section', status: 'sent',
  lines: [
    {
      sort_order: 1, line_type: 'derived_labor', category: 'labor',
      description: 'QA M9 labor (by_section)', quantity: 4, unit_rate: 95,
      cost_basis: 260, derived_amount: 380, billed_amount: 380,
    },
    {
      sort_order: 2, line_type: 'derived_cost', category: 'material',
      description: 'QA M9 material (by_section)',
      cost_basis: 100, derived_amount: 120, billed_amount: 120,
    },
  ],
});

// lump_sum — the opaque instrument. One line exists; she must never reach it.
const lumpSumInvoiceId = await ensureInvoice('QA M9 — lump_sum bill', {
  presentation: 'lump_sum', status: 'sent',
  lines: [
    {
      sort_order: 1, line_type: 'fixed', category: 'other',
      description: 'QA M9 lump sum (client must not see this line)',
      cost_basis: 3000, derived_amount: 5000, billed_amount: 5000,
    },
  ],
});

// A draft bill. Not sent, therefore not a bill — and full_detail, so ONLY the
// status filter can be what hides it.
const draftInvoiceId = await ensureInvoice('QA M9 — draft bill', {
  presentation: 'full_detail', status: 'draft',
  lines: [{
    sort_order: 1, line_type: 'fixed', category: 'other',
    description: 'QA M9 draft line (client must not see this line)',
    cost_basis: 10, derived_amount: 20, billed_amount: 20,
  }],
});

// The claim rows. R8's counterfactual: these must exist, or "a client reads no
// hour claims" is true of an empty table and proves nothing about the floor.
{
  // ⚠️ `member_id` and `work_date` are the CLAIM's own columns, not the
  // segment's — `time_segments` carries neither (they hang off the session).
  // The first version of this fixture selected them from `time_segments`,
  // which fails as a silent `null` and left the R8 probe reading an empty
  // table. Exactly the §2 vacuity trap, inside the fixture written to prevent it.
  const { data: seg } = await db.from('time_segments')
    .select('id').eq('company_id', companyA.id).eq('is_deleted', false).limit(1).maybeSingle();
  const { data: laborLine } = await db.from('invoice_lines')
    .select('id').eq('invoice_id', fullDetailInvoiceId)
    .eq('description', 'QA M9 labor (full_detail)').maybeSingle();
  if (seg && laborLine) {
    await ensureRow(
      'M9 hour claim (R8 — client must never read a crew name)', 'invoice_hour_claims',
      { invoice_id: fullDetailInvoiceId, time_segment_id: seg.id },
      {
        company_id: companyA.id, invoice_id: fullDetailInvoiceId,
        invoice_line_id: laborLine.id, time_segment_id: seg.id,
        member_id: ownerMemberIdA, work_date: '2026-08-01', raw_hours: 8,
      }
    );
  } else {
    note('hour claim fixture', 'WARN',
      `no ${seg ? 'labor line' : 'time_segments'} — the R8 probe would be VACUOUS`);
  }
}

note('M9 financial fixtures', 'exists',
  `full=${fullDetailInvoiceId} section=${bySectionInvoiceId} lump=${lumpSumInvoiceId} draft=${draftInvoiceId} rate=${tmRateId}`);

// ── D-57 / D-58 punch fixtures — the three items the proof needs ────────────
//
// Permanent and idempotent so the migration proof is REPRODUCIBLE by anyone,
// rather than depending on rows a one-off script made and threw away. The three
// cover both arms of the rule and the case it must exclude:
//
//   ASSIGNED   assignee_id = the sub's member id      -> visible after D-57
//   AUTHORED   created_by  = the sub's auth user id   -> visible after D-57
//   NEITHER    assigned to the crew member, authored by owner -> NOT visible
//
// ⚠️ THE TWO ARMS SIT ON DIFFERENT IDENTITY AXES and the fixtures must too, or
// the proof passes for the wrong reason: `assignee_id` FKs to company_members,
// `created_by` FKs to auth.users. A fixture that put the same id in both would
// not distinguish a correct predicate from one that reads the wrong column.
console.log('\nD-57 punch fixtures on the company A fixture project:');

const punchListId = await ensureRow(
  'punch list', 'punch_lists',
  { company_id: companyA.id, project_id: aProjectId, name: 'QA — D-57 fixtures' },
  { company_id: companyA.id, project_id: aProjectId, name: 'QA — D-57 fixtures' }
);

const { data: subUser } = await db.from('profiles').select('user_id').eq('id', subProfile.id).single();
const { data: crewProfile } = await db.from('profiles').select('id').eq('email', 'josh+crew@worthprop.com').single();
const crewMemberId = await memberIdFor(crewProfile.id);
const { data: ownerUser } = await db.from('profiles').select('user_id').eq('email', COMPANY_A_IDENTITIES[0].email).single();

const punchItem = (title, extra) => ({
  label: `punch item — ${title}`,
  match: { company_id: companyA.id, project_id: aProjectId, title },
  insert: {
    company_id: companyA.id, project_id: aProjectId, punch_list_id: punchListId,
    title, status: 'open',
    // Both default to auth.uid(), which is NULL under the service role — so
    // every one of these is set EXPLICITLY or the AUTHORED arm proves nothing.
    created_by: ownerUser.user_id, updated_by: ownerUser.user_id,
    ...extra,
  },
});

for (const spec of [
  punchItem('QA D-57 ASSIGNED to the sub', { assignee_id: subMember.id }),
  punchItem('QA D-57 AUTHORED by the sub', { created_by: subUser.user_id, assignee_id: crewMemberId }),
  punchItem('QA D-57 NEITHER — sub must not see this', { assignee_id: crewMemberId }),
]) {
  await ensureRow(spec.label, 'punch_list_items', spec.match, spec.insert);
}

// ── summary ─────────────────────────────────────────────────────────────────
const created = log.filter((l) => l.status === 'CREATED').length;
console.log(`\n${created} created, ${log.length - created} already present.\n`);
console.log(`Company A: ${companyA.id}`);
console.log(`Company B: ${companyB.id}`);
console.log(`Subcontractor identity: ${SUB_EMAIL}  (member ${subMember.id})`);
console.log(`Client identity:        ${CLIENT_EMAIL}  (no member row, by design)`);
console.log(`Shared password for all test identities: ${TEST_PASSWORD}`);
console.log('(documented in STATE.md → Test Data; rebuild-test only, never production)\n');
