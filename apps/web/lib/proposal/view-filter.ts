// Proposal view derivation — docs/specs/proposal-view-tracking-spec.md §5.
//
// The rows store EVERY non-own open; the scanner filter runs HERE, at read
// time, never at write time. That is the design's whole point: when this
// heuristic improves, every historical count improves with it. Total-opened
// and last-opened are the display, not the storage.

export interface ProposalViewRow {
  estimate_id: string;
  created_at: string;
  user_agent: string | null;
}

export interface ProposalViewStats {
  total: number;
  lastViewedAt: string | null;
}

// Email security scanners and link-preview fetchers open proposal links
// before (or instead of) any human. Substring match on a lowercased UA —
// crude on purpose; a wrong entry here miscounts a display, never loses data.
const NON_HUMAN_UA_SIGNATURES = [
  'bot',
  'crawler',
  'spider',
  'scan',
  'monitor',
  'preview',
  'headless',
  'curl',
  'wget',
  'python',
  'googleimageproxy',
  'facebookexternalhit',
  'proofpoint',
  'mimecast',
  'barracuda',
];

export function isLikelyNonHuman(userAgent: string | null): boolean {
  // No UA at all is a scripted client, not a browser.
  if (!userAgent || !userAgent.trim()) return true;
  const ua = userAgent.toLowerCase();
  return NON_HUMAN_UA_SIGNATURES.some((sig) => ua.includes(sig));
}

/** Group rows per estimate, humans only. Rows arrive in any order. */
export function deriveViewStats(rows: ProposalViewRow[]): Record<string, ProposalViewStats> {
  const out: Record<string, ProposalViewStats> = {};
  for (const row of rows) {
    if (isLikelyNonHuman(row.user_agent)) continue;
    const stats = (out[row.estimate_id] ??= { total: 0, lastViewedAt: null });
    stats.total += 1;
    if (stats.lastViewedAt === null || row.created_at > stats.lastViewedAt) {
      stats.lastViewedAt = row.created_at;
    }
  }
  return out;
}
