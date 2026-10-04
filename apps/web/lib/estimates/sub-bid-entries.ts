/**
 * S128 1b — Part E-1 (docs/specs/estimates-and-change-orders-spec.md): what the Sub Bids
 * tab lists.
 *
 * Vocabulary: an `estimate_line_items` row is what the editor (and Josh) call a SECTION;
 * its `estimate_line_rows` are the LINES. A SUB line is a row with row_type 'subcontractor'.
 *
 * _Superseded (quoted, not deleted):_ the tab found a section's sub line with
 * `rows.find(r => r.line_item_id === id && r.row_type === 'subcontractor')` — the FIRST one
 * by sort_order — and titled the card by the section. A section holding two sub lines
 * (EST-115: Electric – Rough in $7,000 and Plumbing – Rough in $850 under Rough Phase)
 * showed one card reading $7,000 and Plumbing never appeared.
 *
 * Now EVERY sub line is its own entry, titled by the line with its section as context, and
 * carrying its own amount. ⚠️ Bids, requests and the award are still keyed per SECTION in the
 * schema (estimate_sub_bids / estimate_sub_bid_requests .line_item_id; set_winning_bid refuses
 * a section with 2+ sub lines). Re-keying them per line is the separate sub-bids build
 * (S128 ASK-E1); this function only stops the tab hiding a line.
 */

export interface SubBidSectionInput {
  id: string;
  name: string;
}

export interface SubBidRowInput {
  id: string;
  line_item_id: string;
  row_type: string;
  name: string;
  amount: number | null;
  sort_order: number;
}

export interface SubBidLineEntry {
  rowId: string;
  name: string;
  amount: number | null;
}

export interface SubBidSectionEntry<S extends SubBidSectionInput> {
  section: S;
  /** Every sub line in the section, in sort order. Empty when the section is listed only
   *  because it already has bids recorded. */
  subLines: SubBidLineEntry[];
}

/** The sections the tab lists, each with ALL of its sub lines. A section is listed when it
 *  carries at least one sub line or already has a bid recorded (as before). */
export function subBidEntries<S extends SubBidSectionInput>(
  sections: S[],
  rows: SubBidRowInput[],
  bidSectionIds: string[]
): SubBidSectionEntry<S>[] {
  const withBids = new Set(bidSectionIds);
  return sections
    .map((section) => ({
      section,
      subLines: rows
        .filter((r) => r.line_item_id === section.id && r.row_type === 'subcontractor')
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({ rowId: r.id, name: r.name, amount: r.amount })),
    }))
    .filter((e) => e.subLines.length > 0 || withBids.has(e.section.id));
}
