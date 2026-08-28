import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// Desktop redesign, Phase D — the six-section project header (§1).
// ============================================================================
//
// R1 IS THE ONLY REAL LOGIC IN THE PHASE and it is role-dependent, so it is
// tested AS ROLES, not once: a section link resolves to the CALLER'S first
// visible sub-tab. Money is the section that exercises every branch —
//   owner   → Budget & Cost (sees everything)
//   foreman → Budget & Cost (budget visible, invoices/payments/profitability
//             filtered — the §5b acceptance case)
//   crew    → Change Orders (budget itself is filtered; the first VISIBLE
//             sub-tab is not the first sub-tab)
//
// Rendered with renderToStaticMarkup (the s158-ui-fixes pattern): the question
// is what the header emits — hrefs, presence, absence — and that is decidable
// without a browser. Role REACHABILITY of the underlying pages is not decided
// here; every page keeps its own server-side gate and RLS, untouched by this
// phase (R2).
//
// The zero-visible-sub-tabs branch (a section that drops entirely) is
// unreachable with the live gates — every section keeps at least one ungated
// sub-tab for every dashboard role — so it has no test case; the filter is
// three lines and the case is recorded here so nobody hunts for the missing
// assertion.

let pathname = '/dashboard/projects/p1';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

import { ProjectHeader } from '@/app/dashboard/projects/[id]/project-header';
import type { ProjectWithContact } from '@/lib/services/projects';

const project = {
  id: 'p1',
  name: 'Weller Residence',
  project_number: 'PRJ-1001',
  status: 'active',
  contact: null,
} as unknown as ProjectWithContact;

function markup(role: string, at: string): string {
  pathname = at === '' ? '/dashboard/projects/p1' : `/dashboard/projects/p1/${at}`;
  return renderToStaticMarkup(
    <ProjectHeader project={project} canManage={false} role={role} />
  );
}

const SECTION_IDS = [
  'project-section-overview',
  'project-section-work',
  'project-section-money',
  'project-section-documents',
  'project-section-people',
  'project-section-chat',
];

describe('the six sections render for every dashboard role', () => {
  for (const role of ['owner', 'admin', 'project_manager', 'foreman', 'crew_member']) {
    it(`${role} sees all six section headers`, () => {
      const html = markup(role, '');
      for (const id of SECTION_IDS) expect(html).toContain(`data-testid="${id}"`);
    });
  }
});

/** The <a> tag carrying the given testid — attribute order is not assumed. */
function tagFor(html: string, testid: string): string {
  const match = html.match(new RegExp(`<a[^>]*data-testid="${testid}"[^>]*>`));
  expect(match, `no <a> with data-testid="${testid}"`).not.toBeNull();
  return match![0];
}

describe('R1 — a section link is the CALLERʼS first visible sub-tab', () => {
  it('owner: Money resolves to Budget & Cost', () => {
    const tag = tagFor(markup('owner', ''), 'project-section-money');
    expect(tag).toContain('href="/dashboard/projects/p1/budget"');
  });

  it('foreman: Money resolves to Budget & Cost — budget is foreman-visible', () => {
    const tag = tagFor(markup('foreman', ''), 'project-section-money');
    expect(tag).toContain('href="/dashboard/projects/p1/budget"');
  });

  it('crew: Money resolves to Change Orders — the first sub-tab is not the first VISIBLE one', () => {
    const html = markup('crew_member', '');
    const tag = tagFor(html, 'project-section-money');
    expect(tag).toContain('href="/dashboard/projects/p1/changes"');
    expect(html).not.toContain('Budget &amp; Cost');
  });
});

describe('R2 — the gated money sub-tabs are absent for the roles the live gates exclude', () => {
  it('foreman in Money: Budget & Cost and Change Orders only — no Invoices, Payments or Profitability', () => {
    const html = markup('foreman', 'budget');
    expect(html).toContain('data-testid="project-subtab-budget"');
    expect(html).toContain('data-testid="project-subtab-changes"');
    expect(html).not.toContain('project-subtab-invoices');
    expect(html).not.toContain('project-subtab-payments');
    expect(html).not.toContain('project-subtab-profitability');
    expect(html).not.toContain('Profitability');
  });

  it('PM in Money: keeps Invoices, loses Payments and Profitability (the invoice floor, live gates)', () => {
    const html = markup('project_manager', 'budget');
    expect(html).toContain('project-subtab-invoices');
    expect(html).not.toContain('project-subtab-payments');
    expect(html).not.toContain('project-subtab-profitability');
  });

  it('owner in Money: all five, in §1ʼs order', () => {
    const html = markup('owner', 'budget');
    const order = ['budget', 'changes', 'invoices', 'payments', 'profitability'].map(
      (s) => html.indexOf(`project-subtab-${s}`)
    );
    for (const idx of order) expect(idx).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('R3 / R4 — People is two sub-tabs; sections of one render no row', () => {
  it('People: exactly Contacts and Team', () => {
    const html = markup('owner', 'contacts');
    expect(html).toContain('project-subtab-contacts');
    expect(html).toContain('project-subtab-team');
    const subtabs = html.match(/project-subtab-[a-z-]+/g) ?? [];
    expect(new Set(subtabs)).toEqual(new Set(['project-subtab-contacts', 'project-subtab-team']));
  });

  it('Overview renders NO sub-tab row', () => {
    expect(markup('owner', '')).not.toContain('project-subtab-');
  });

  it('Chat renders NO sub-tab row', () => {
    expect(markup('owner', 'chat')).not.toContain('project-subtab-');
  });

  it('counter-vacuity: a multi-tab section DOES render the row', () => {
    expect(markup('owner', 'files')).toContain('project-subtab-photos');
  });
});
