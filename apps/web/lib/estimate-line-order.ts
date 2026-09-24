// S108 Spec B ruling #5 — drag-reorder of estimate LINES (the section cards),
// within a category and across categories. PURE: no I/O, so the whole plan is
// unit-testable (s108-line-order.test.ts) apart from the UI that drives it.
//
// ⚠️ ORDER IS ESTIMATE-GLOBAL, NOT PER CATEGORY. `sort_order` on
// estimate_line_items is read in ONE global order by every consumer —
// getEstimate(), the proposal (lib/proposal/proposal-data.ts groups by
// category but keeps the global order inside each group), and line billing.
// So a move renumbers the WHOLE estimate in DISPLAY order (category by
// category; inside a category, its direct lines first, then each subcategory's
// lines), and emits only the rows whose sort_order or parent actually changed.
// Renumbering per category instead would leave two lists sharing numbers,
// which every global reader would interleave.
//
// Authority is NOT here. The write goes through reorder_estimate_lines()
// (20261640000000), which is SECURITY INVOKER: RLS decides who may reorder
// (draft only; a PM only their own draft) and the containment trigger decides
// where a line may go. This module only computes the intended order.

export interface OrderCategory {
  id: string;
  sort_order: number;
}
export interface OrderSubcategory {
  id: string;
  category_id: string;
  sort_order: number;
}
export interface OrderLine {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  sort_order: number;
}

/** Where a line lands: a container, and the line to land BEFORE (null = the end). */
export interface LineDestination {
  categoryId: string;
  subcategoryId: string | null;
  beforeLineId: string | null;
}

export interface LineMove {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  sort_order: number;
}

interface Container {
  categoryId: string;
  subcategoryId: string | null;
  lineIds: string[];
}

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

/** Every container in display order, each holding its lines in display order.
 *  Empty containers are included — they are valid drop targets. */
export function containersInOrder(
  categories: OrderCategory[],
  subcategories: OrderSubcategory[],
  lines: OrderLine[]
): Container[] {
  const sortedLines = [...lines].sort(bySort);
  const out: Container[] = [];
  for (const c of [...categories].sort(bySort)) {
    out.push({
      categoryId: c.id,
      subcategoryId: null,
      lineIds: sortedLines
        .filter((l) => l.category_id === c.id && l.subcategory_id == null)
        .map((l) => l.id),
    });
    for (const s of subcategories.filter((s) => s.category_id === c.id).sort(bySort)) {
      out.push({
        categoryId: c.id,
        subcategoryId: s.id,
        lineIds: sortedLines.filter((l) => l.subcategory_id === s.id).map((l) => l.id),
      });
    }
  }
  return out;
}

/** The moves that put `lineId` at `dest`. Empty when nothing would change
 *  (dropping a line onto itself, or into the place it already occupies). */
export function planLineMove(
  categories: OrderCategory[],
  subcategories: OrderSubcategory[],
  lines: OrderLine[],
  lineId: string,
  dest: LineDestination
): LineMove[] {
  if (dest.beforeLineId === lineId) return [];
  const moving = lines.find((l) => l.id === lineId);
  if (!moving) throw new Error(`planLineMove: unknown line ${lineId}`);
  if (dest.subcategoryId != null) {
    const sub = subcategories.find((s) => s.id === dest.subcategoryId);
    // Mirrors the containment trigger: a subcategory belongs to one category.
    if (!sub || sub.category_id !== dest.categoryId) {
      throw new Error('planLineMove: that subcategory is not part of that category');
    }
  }
  if (!categories.some((c) => c.id === dest.categoryId)) {
    throw new Error('planLineMove: unknown destination category');
  }

  const containers = containersInOrder(categories, subcategories, lines);
  const positionOf = (cs: Container[]) => {
    const k = cs.findIndex((c) => c.lineIds.includes(lineId));
    return `${k}:${cs[k]?.lineIds.indexOf(lineId)}`;
  };
  const wasAt = positionOf(containers);
  for (const c of containers) c.lineIds = c.lineIds.filter((id) => id !== lineId);
  const target = containers.find(
    (c) => c.categoryId === dest.categoryId && c.subcategoryId === dest.subcategoryId
  );
  if (!target) throw new Error('planLineMove: destination container not found');
  const at = dest.beforeLineId == null ? -1 : target.lineIds.indexOf(dest.beforeLineId);
  if (at < 0) target.lineIds.push(lineId);
  else target.lineIds.splice(at, 0, lineId);
  // Dropped where it already was — nothing to write, even if legacy numbering
  // (gaps, duplicates) would otherwise be tidied.
  if (positionOf(containers) === wasAt) return [];

  const byId = new Map(lines.map((l) => [l.id, l]));
  const moves: LineMove[] = [];
  let n = 0;
  for (const c of containers) {
    for (const id of c.lineIds) {
      n += 1;
      const before = byId.get(id)!;
      const next: LineMove = {
        id,
        category_id: c.categoryId,
        subcategory_id: c.subcategoryId,
        sort_order: n,
      };
      if (
        before.sort_order !== next.sort_order ||
        before.category_id !== next.category_id ||
        (before.subcategory_id ?? null) !== next.subcategory_id
      ) {
        moves.push(next);
      }
    }
  }
  return moves;
}

/** The keyboard / touch alternative to dragging (FILL-B10): one step up or
 *  down in display order. Crossing a container boundary moves the line to the
 *  END of the previous container (up) or the START of the next one (down) —
 *  which is where it visibly goes. Empty containers are skipped; drag reaches
 *  them. Returns null at either end of the estimate. */
export function stepDestination(
  categories: OrderCategory[],
  subcategories: OrderSubcategory[],
  lines: OrderLine[],
  lineId: string,
  direction: 'up' | 'down'
): LineDestination | null {
  const containers = containersInOrder(categories, subcategories, lines);
  const ci = containers.findIndex((c) => c.lineIds.includes(lineId));
  if (ci < 0) return null;
  const here = containers[ci];
  const i = here.lineIds.indexOf(lineId);

  if (direction === 'up') {
    if (i > 0) {
      return { categoryId: here.categoryId, subcategoryId: here.subcategoryId, beforeLineId: here.lineIds[i - 1] };
    }
    for (let k = ci - 1; k >= 0; k -= 1) {
      if (containers[k].lineIds.length > 0) {
        return { categoryId: containers[k].categoryId, subcategoryId: containers[k].subcategoryId, beforeLineId: null };
      }
    }
    return null;
  }

  if (i < here.lineIds.length - 1) {
    // "before the line after next", or the end if the next is the last.
    const afterNext = here.lineIds[i + 2] ?? null;
    return { categoryId: here.categoryId, subcategoryId: here.subcategoryId, beforeLineId: afterNext };
  }
  for (let k = ci + 1; k < containers.length; k += 1) {
    if (containers[k].lineIds.length > 0) {
      return { categoryId: containers[k].categoryId, subcategoryId: containers[k].subcategoryId, beforeLineId: containers[k].lineIds[0] };
    }
  }
  return null;
}

// ── S110 D1 — the ROWS inside one line ──────────────────────────────────────
// A row never leaves its line (the estimate_line_rows_containment trigger), so
// the plan is a permutation of ONE line's row ids. The RPC
// reorder_estimate_line_rows() takes the COMPLETE list and renumbers 1..n —
// sort_order is not unique and duplicates exist, so a two-value swap could be a
// no-op; a full renumber never is.

export interface OrderRow {
  id: string;
  sort_order: number;
}

/** The line's row ids in display order (sort_order, then id for a stable tie). */
export function rowsInOrder(rows: OrderRow[]): string[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => r.id);
}

/** Move `rowId` to sit before `beforeRowId` (null = last). Returns the new full
 *  order, or null when nothing would change. Throws on an id not in the list. */
export function planRowMove(orderedIds: string[], rowId: string, beforeRowId: string | null): string[] | null {
  if (!orderedIds.includes(rowId)) throw new Error('That row is not on this line');
  if (beforeRowId !== null && !orderedIds.includes(beforeRowId)) {
    throw new Error('That row is not on this line');
  }
  if (beforeRowId === rowId) return null;
  const rest = orderedIds.filter((id) => id !== rowId);
  const at = beforeRowId === null ? rest.length : rest.indexOf(beforeRowId);
  const next = [...rest.slice(0, at), rowId, ...rest.slice(at)];
  return next.every((id, i) => id === orderedIds[i]) ? null : next;
}

/** One keyboard step. null = already at that end. */
export function stepRow(orderedIds: string[], rowId: string, dir: 'up' | 'down'): string[] | null {
  const i = orderedIds.indexOf(rowId);
  if (i < 0) throw new Error('That row is not on this line');
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= orderedIds.length) return null;
  const next = [...orderedIds];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
