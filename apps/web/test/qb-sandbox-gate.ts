import type { SupabaseClient } from '@supabase/supabase-js';
import { QBO_MINOR_VERSION, qboApiBase, qboEnvironment } from '@/lib/quickbooks/config';
import { getAccessToken, type QboConnection } from '@/lib/quickbooks/tokens';

// ============================================================================
// S124 — "AM I IN THE SANDBOX?" Run before a live harness's FIRST QuickBooks
// write, and it throws on any mismatch.
//
// ⚠️ WHY IT EXISTS [S124 1.2]: the production deployment's QBO_ENVIRONMENT is
// `production` and Worth Properties' realm is LIVE BOOKS. Stop rule 3 forbids
// any write reaching a real company's QuickBooks, so every Part 1/3 proof that
// writes a TimeActivity must first prove which books it is talking to. Four
// independent checks, none of which can pass on production:
//
//   1. qboEnvironment() === 'sandbox' — the host the app's own client will use;
//   2. the company's stored realm is EXACTLY the sandbox realm;
//   3. companyinfo on the SANDBOX host answers 200 with "Sandbox Company…";
//   4. the SAME token on the PRODUCTION host does NOT answer 200 — the inverse
//      of S124 1.2's control, where the live realm answered only there.
//
// Checks 1 and 2 run before any network call, so a misconfigured run refuses
// without touching Intuit at all.
// ============================================================================

/** rebuild-test's fixture tenant, Sabal Point Construction. */
export const SANDBOX_COMPANY_ID = '03bb903f-1084-4ab4-afb8-03192cb58d30';
/** `Sandbox Company US cc64` (context104 §2). */
export const SANDBOX_REALM = '9341457813274121';

export interface SandboxProof {
  conn: QboConnection;
  companyName: string;
  sandboxStatus: number;
  productionStatus: number;
}

async function companyInfo(
  host: string,
  conn: QboConnection
): Promise<{ status: number; name: string | null }> {
  const r = await fetch(
    `${host}/v3/company/${conn.realmId}/companyinfo/${conn.realmId}?minorversion=${QBO_MINOR_VERSION}`,
    {
      headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    }
  );
  const text = await r.text();
  let name: string | null = null;
  try {
    name = (JSON.parse(text) as { CompanyInfo?: { CompanyName?: string } }).CompanyInfo?.CompanyName ?? null;
  } catch {
    name = null;
  }
  return { status: r.status, name };
}

export async function assertSandbox(
  admin: SupabaseClient,
  companyId: string = SANDBOX_COMPANY_ID
): Promise<SandboxProof> {
  if (qboEnvironment() !== 'sandbox') {
    throw new Error(`[qb-sandbox-gate] REFUSED: qboEnvironment() is '${qboEnvironment()}', not 'sandbox'.`);
  }

  const { data: company, error } = await admin
    .from('companies')
    .select('qb_realm_id, qb_connection_state')
    .eq('id', companyId)
    .single();
  if (error || !company) {
    throw new Error(`[qb-sandbox-gate] REFUSED: company ${companyId} not readable: ${error?.message}`);
  }
  if (company.qb_realm_id !== SANDBOX_REALM) {
    throw new Error(
      `[qb-sandbox-gate] REFUSED: realm '${company.qb_realm_id}' is not the sandbox realm ${SANDBOX_REALM}.`
    );
  }

  const conn = await getAccessToken(admin, companyId);
  if (!conn) {
    throw new Error(
      `[qb-sandbox-gate] NO USABLE TOKEN (state '${company.qb_connection_state}'). The sandbox ` +
        'connection is dead or the sandbox keys are missing; reconnect Sabal Point to the sandbox.'
    );
  }

  const sandbox = await companyInfo(qboApiBase('sandbox'), conn);
  if (sandbox.status !== 200 || !sandbox.name?.startsWith('Sandbox Company')) {
    throw new Error(
      `[qb-sandbox-gate] REFUSED: sandbox host answered ${sandbox.status} with company '${sandbox.name}'.`
    );
  }
  const production = await companyInfo(qboApiBase('production'), conn);
  if (production.status === 200) {
    throw new Error('[qb-sandbox-gate] REFUSED: the PRODUCTION host accepted this token. These are live books.');
  }

  return {
    conn,
    companyName: sandbox.name,
    sandboxStatus: sandbox.status,
    productionStatus: production.status,
  };
}
