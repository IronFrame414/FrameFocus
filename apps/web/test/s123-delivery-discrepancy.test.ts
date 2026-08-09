import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveLink } from '@/lib/notify/links';

// ============================================================================
// SLICE 6 — §3g, delivery discrepancy. No migration.
// Spec: docs/specs/notifications-architecture.md §3g.
// ============================================================================
//
// Like §3f's cron, this route cannot be driven end to end from a harness: a
// check-in emails every Owner, Admin and assigned PM through Resend. So the
// assertions are over the wiring and the destination, and they are chosen for
// the two things that would actually go wrong.

const source = readFileSync(
  fileURLToPath(new URL('../app/api/deliveries/check-in/route.ts', import.meta.url)),
  'utf8'
);
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('§3g — the notification fires only on exceptions', () => {
  it('is guarded by hasExceptions', () => {
    // The EMAIL goes out for clean deliveries too — "[Clean] Delivery — …" —
    // and that is right for a record. A notification per clean truck is noise
    // that buries the one that matters.
    expect(code).toContain('if (hasExceptions) {');
    const block = code.slice(code.indexOf('if (hasExceptions) {'));
    expect(block).toContain("type: 'discrepancy'");
  });

  it('the notify call is INSIDE that guard, not merely after it', () => {
    // A `notify(` that sits after the closing brace still runs for every
    // delivery, and reads as guarded to anyone skimming.
    const guardStart = code.indexOf('if (hasExceptions) {');
    const notifyCall = code.indexOf("type: 'discrepancy'");
    const emailLoop = code.indexOf('for (const [email] of recipients)');
    expect(guardStart).toBeGreaterThan(-1);
    expect(notifyCall).toBeGreaterThan(guardStart);
    // …and it happens before the per-recipient Resend round trips, which is the
    // same ordering slices 3 and 4 use: the fast channel first.
    expect(notifyCall).toBeLessThan(emailLoop);
  });

  it('the email is NOT gated on exceptions — the two channels differ on purpose', () => {
    // Paired negative. If a future edit "tidies" the email into the same guard,
    // clean deliveries stop being recorded by email at all.
    expect(code.indexOf('const subject =')).toBeGreaterThan(-1);
    expect(code).toContain("hasExceptions ? 'EXCEPTIONS' : 'Clean'");
  });
});

describe('§3g — the destination', () => {
  it('resolves to the delivery detail route, with the /d/ segment', () => {
    // Dropping `/d/` lands on the PO-keyed sibling, which resolves for a PO id
    // and 404s for a delivery id — a bug that would look intermittent.
    expect(resolveLink('delivery', { id: 'del1', projectId: 'p1' }, 'desktop')).toBe(
      '/dashboard/field-ops/p1/deliveries/d/del1'
    );
  });

  it('the notification and the email point at the same delivery', () => {
    // The email builds `/dashboard/field-ops/${project.id}/deliveries/${po ?? `d/${id}`}`.
    // Two channels about one truck opening two different screens is drift
    // nobody reports; they just stop trusting one of them.
    expect(code).toContain('/deliveries/${');
    expect(code).toContain("linkKey: 'delivery'");
    expect(code).toContain('linkParams: { id: delivery.id, projectId: project.id }');
  });

  it('mobile lands on the project deliveries list — no detail screen exists', () => {
    expect(resolveLink('delivery', { id: 'del1', projectId: 'p1' }, 'mobile')).toBe(
      '/m/p/p1/deliveries'
    );
  });
});

describe('§3g — the recipient set comes from the shared helpers', () => {
  it('uses the notify resolvers, not a second inline profile join', () => {
    // The route already had an inline project_assignments→profiles join for the
    // EMAIL audience. Copying it for notify() would be two definitions of "who
    // is a project PM" in one file — the divergence CLAUDE.md's parity rule
    // describes, written in the form that looks most like agreement.
    expect(code).toContain('getManagerNotifyRecipients(admin, project.company_id)');
    expect(code).toContain('getProjectPmNotifyRecipients(admin, project.id)');
  });

  it('a notify failure does not cost the delivery its email', () => {
    const block = code.slice(code.indexOf('if (hasExceptions) {'));
    expect(block.slice(0, block.indexOf('for (const [email]'))).toContain('catch');
  });
});
