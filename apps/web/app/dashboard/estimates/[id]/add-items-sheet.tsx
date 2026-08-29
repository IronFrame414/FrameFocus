'use client';

// PO module 17a/17b/17c — the two-step add-items sheet (po-module-spec.md §6).
//
// THE CONTRACT (R8): nothing is written to the estimate until step 2 is
// confirmed; then N rows land in ONE insert (addEstimateLineRows), ONE
// recalculateEstimateTotals, ONE reload. The tray persists across source
// switches; only Cancel or a successful add clears it.
//
// Faithful narrowings, recorded in the spec and the Phase-4 report:
//   · "Section" = the TARGET LINE ITEM (the estimate's real structure —
//     categories → line items → rows). Grouping and subtotals key on the
//     target's category.
//   · Markup left blank = NULL = inherit the estimate default for that
//     row_type — the null-inheritance rule. The input's placeholder shows the
//     inherited value; apply-to-all writes only what was typed.
//   · No Optional toggle, no per-row description/note: neither exists at row
//     level in the schema, and rendering editors that silently target the
//     shared line item would mislead (inventory A2.4/A2.5).
//   · Sources: the five catalog types + manual (R-Q7). No assemblies (R-Q8).
//
// Favorites write immediately (a catalog write, not an estimate write — the
// R8 contract governs the estimate). 'Used on this job' derives from the
// estimate's own rows' catalog_item_id.

import { useEffect, useMemo, useState } from 'react';
import {
  CatalogItemType,
  CostCatalogItem,
  catalogRowTypeFor,
  createCatalogItem,
  listCatalog,
  setCatalogFavorite,
  type CatalogCategory,
  type CatalogUnitOfMeasure,
} from '@/lib/services/cost-catalog-client';
import {
  addEstimateLineRows,
  recalculateEstimateTotals,
  type CreateLineRowInput,
} from '@/lib/services/estimate-items-client';
import type { LaborUnit, MaterialUnitOfMeasure, RowType } from '@/lib/services/estimates-client';
import { fmtMoney } from '../labels';
import type { TabProps } from './estimate-builder';
import { color, font } from '@/lib/theme';

const ITEM_TYPES: { key: CatalogItemType; label: string }[] = [
  { key: 'material', label: 'Material' },
  { key: 'labor', label: 'Labor' },
  { key: 'subcontractor', label: 'Subcontractor' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'other', label: 'Other' },
];

interface TrayEntry {
  key: string; // catalog item id, or manual-<n>
  source: 'catalog' | 'manual';
  name: string;
  rowType: RowType;
  itemType: CatalogItemType;
  catalogItemId: string | null;
  vendorId: string | null; // R4 snapshot — catalog default, or NULL for manual
  costCode: string | null; // display; feeds save-to-catalog for manual rows
  qty: string;
  unit: CatalogUnitOfMeasure;
  unitCost: string; // material/equipment-as-other basis; labor rate; sub/other amount
  markup: string; // '' = inherit (NULL)
  applyTax: boolean;
  lineItemId: string; // the target "Section"
  saveToCatalog: boolean; // manual rows only (17c, ticked by default)
}

function basisOf(e: TrayEntry): number {
  const qty = Number(e.qty) || 0;
  const cost = Number(e.unitCost) || 0;
  if (e.rowType === 'labor') return qty * cost; // rate × qty
  if (e.rowType === 'material') return qty * cost;
  return cost; // subcontractor / other carry a single amount
}

export function AddItemsSheet({
  data,
  reload,
  onClose,
}: Pick<TabProps, 'data' | 'reload'> & { onClose: () => void }) {
  const { estimate, categories, lineItems, rows } = data;

  const [step, setStep] = useState<1 | 2>(1);
  const [source, setSource] = useState<CatalogItemType | 'manual'>('material');
  const [catalog, setCatalog] = useState<CostCatalogItem[] | null>(null);
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState<'all' | 'favorites' | 'used'>('all');
  const [tray, setTray] = useState<TrayEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualSeq, setManualSeq] = useState(1);

  useEffect(() => {
    listCatalog().then(setCatalog);
  }, []);

  const usedOnThisJob = useMemo(
    () => new Set(rows.map((r) => r.catalog_item_id).filter(Boolean) as string[]),
    [rows]
  );

  const defaultLineItemId = lineItems[0]?.id ?? '';

  const lineItemLabel = useMemo(() => {
    const byId = new Map<string, string>();
    for (const li of lineItems) {
      const cat = categories.find((c) => c.id === li.category_id);
      byId.set(li.id, `${cat ? cat.name + ' · ' : ''}${li.name}`);
    }
    return byId;
  }, [lineItems, categories]);

  // Inherited markup per row type (the null-inheritance placeholder).
  function inheritedMarkup(rowType: RowType): number | null {
    if (rowType === 'material') return estimate.material_markup_percent;
    if (rowType === 'labor') return estimate.labor_markup_percent;
    if (rowType === 'subcontractor') return estimate.subcontractor_markup_percent;
    return null; // 'other' has no estimate-level default
  }

  function sellOf(e: TrayEntry): number {
    const basis = basisOf(e);
    const m = e.markup.trim() === '' ? inheritedMarkup(e.rowType) : Number(e.markup);
    return m == null || Number.isNaN(m) ? basis : basis * (1 + m / 100);
  }

  const typeCounts = useMemo(() => {
    const counts = new Map<CatalogItemType, number>();
    for (const item of catalog ?? []) {
      counts.set(item.item_type, (counts.get(item.item_type) ?? 0) + 1);
    }
    return counts;
  }, [catalog]);

  const visibleCatalog = useMemo(() => {
    if (source === 'manual' || catalog === null) return [];
    return catalog.filter((item) => {
      if (item.item_type !== source) return false;
      if (chip === 'favorites' && !item.is_favorite) return false;
      if (chip === 'used' && !usedOnThisJob.has(item.id)) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [catalog, source, chip, search, usedOnThisJob]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CostCatalogItem[]>();
    for (const item of visibleCatalog) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return [...groups.entries()];
  }, [visibleCatalog]);

  const inTray = useMemo(() => new Set(tray.map((t) => t.key)), [tray]);

  function togglePick(item: CostCatalogItem) {
    setError(null);
    if (inTray.has(item.id)) {
      setTray((prev) => prev.filter((t) => t.key !== item.id));
      return;
    }
    if (!defaultLineItemId) {
      setError('Add a category and a line item to the estimate first — rows need a section.');
      return;
    }
    const rowType = catalogRowTypeFor(item.item_type);
    setTray((prev) => [
      ...prev,
      {
        key: item.id,
        source: 'catalog',
        name: item.name,
        rowType,
        itemType: item.item_type,
        catalogItemId: rowType === 'material' ? item.id : null, // the CHECK forbids it elsewhere
        vendorId: rowType === 'material' ? item.default_vendor_id : null, // R4 snapshot
        costCode: item.cost_code,
        qty: '1',
        unit: item.unit_of_measure,
        unitCost: item.unit_cost != null ? String(item.unit_cost) : '',
        markup: '',
        applyTax: rowType === 'material',
        lineItemId: defaultLineItemId,
        saveToCatalog: false,
      },
    ]);
  }

  async function toggleFavorite(item: CostCatalogItem) {
    const next = !item.is_favorite;
    setCatalog((prev) =>
      (prev ?? []).map((c) => (c.id === item.id ? { ...c, is_favorite: next } : c))
    );
    const res = await setCatalogFavorite(item.id, next);
    if (!res.success) {
      setCatalog((prev) =>
        (prev ?? []).map((c) => (c.id === item.id ? { ...c, is_favorite: !next } : c))
      );
    }
  }

  // 17c — manual entry state
  const [manual, setManual] = useState({
    name: '',
    itemType: 'material' as CatalogItemType,
    qty: '1',
    unit: 'each' as CatalogUnitOfMeasure,
    unitCost: '',
    markup: '',
    applyTax: true,
    costCode: '',
    saveToCatalog: true,
  });

  function addManualToTray() {
    setError(null);
    if (!manual.name.trim()) {
      setError('Name the item first.');
      return;
    }
    if (!defaultLineItemId) {
      setError('Add a category and a line item to the estimate first — rows need a section.');
      return;
    }
    const rowType = catalogRowTypeFor(manual.itemType);
    setTray((prev) => [
      ...prev,
      {
        key: `manual-${manualSeq}`,
        source: 'manual',
        name: manual.name.trim(),
        rowType,
        itemType: manual.itemType,
        catalogItemId: null,
        vendorId: null, // R4 — the honest blank; never guess a string
        costCode: manual.costCode.trim() || null,
        qty: manual.qty,
        unit: manual.unit,
        unitCost: manual.unitCost,
        markup: manual.markup,
        applyTax: rowType === 'material' ? manual.applyTax : false,
        lineItemId: defaultLineItemId,
        saveToCatalog: manual.saveToCatalog,
      },
    ]);
    setManualSeq((n) => n + 1);
    setManual((m) => ({ ...m, name: '', unitCost: '', qty: '1', costCode: '' }));
  }

  function patchEntry(key: string, patch: Partial<TrayEntry>) {
    setTray((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  // Apply-to-all (17b): writes ONLY what was typed — an empty markup applies
  // nothing (inheritance stays NULL for untouched rows).
  const [applyMarkup, setApplyMarkup] = useState('');
  const [applySection, setApplySection] = useState('');

  const totals = useMemo(() => {
    const cost = tray.reduce((s, e) => s + basisOf(e), 0);
    const sell = tray.reduce((s, e) => s + sellOf(e), 0);
    return { cost, markup: sell - cost, sell };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tray, estimate]);

  // Step-2 grouping: by the TARGET's category.
  const step2Groups = useMemo(() => {
    const groups = new Map<string, { label: string; entries: TrayEntry[] }>();
    for (const e of tray) {
      const li = lineItems.find((l) => l.id === e.lineItemId);
      const cat = li ? categories.find((c) => c.id === li.category_id) : null;
      const groupKey = cat?.id ?? 'unsectioned';
      const g = groups.get(groupKey) ?? { label: cat?.name ?? 'No section', entries: [] };
      g.entries.push(e);
      groups.set(groupKey, g);
    }
    return [...groups.values()];
  }, [tray, lineItems, categories]);

  async function confirmAdd() {
    if (tray.length === 0) return;
    setBusy(true);
    setError(null);

    // Per-target sort orders: append after each line item's existing rows.
    const nextSort = new Map<string, number>();
    for (const li of lineItems) {
      const existing = rows.filter((r) => r.line_item_id === li.id);
      nextSort.set(
        li.id,
        existing.length > 0 ? Math.max(...existing.map((r) => r.sort_order)) + 1 : 0
      );
    }

    const inputs: CreateLineRowInput[] = tray.map((e) => {
      const order = nextSort.get(e.lineItemId) ?? 0;
      nextSort.set(e.lineItemId, order + 1);
      const markup = e.markup.trim() === '' ? null : Number(e.markup);
      const base = {
        line_item_id: e.lineItemId,
        row_type: e.rowType,
        name: e.name,
        sort_order: order,
        markup_percent: markup,
      };
      if (e.rowType === 'labor') {
        return {
          ...base,
          apply_tax: false,
          rate: Number(e.unitCost) || 0,
          quantity: Number(e.qty) || 0,
          labor_unit: 'hours' as LaborUnit,
        };
      }
      if (e.rowType === 'material') {
        return {
          ...base,
          apply_tax: e.applyTax,
          unit_of_measure: e.unit as MaterialUnitOfMeasure,
          unit_cost: Number(e.unitCost) || 0,
          quantity: Number(e.qty) || 0,
          catalog_item_id: e.catalogItemId,
          vendor_id: e.vendorId,
        };
      }
      return { ...base, apply_tax: false, amount: Number(e.unitCost) || 0 };
    });

    const result = await addEstimateLineRows(inputs);
    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'Adding failed — nothing was written.');
      return;
    }

    // ONE recalc, ONE reload (R8).
    const recalc = await recalculateEstimateTotals(estimate.id);
    if (!recalc.success) setError(recalc.error ?? 'Rows added; totals failed to recalculate.');

    // 17c "Save this to the cost catalog" — after the estimate write; a
    // catalog failure never takes the added rows with it.
    const toSave = tray.filter((e) => e.source === 'manual' && e.saveToCatalog);
    for (const e of toSave) {
      await createCatalogItem({
        name: e.name,
        category: 'other' as CatalogCategory,
        unit_of_measure: e.unit,
        unit_cost: Number(e.unitCost) || 0,
        item_type: e.itemType,
        cost_code: e.costCode,
      });
    }

    await reload();
    setBusy(false);
    setTray([]);
    onClose();
  }

  // ── styles ──
  const railBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 11px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 600,
    textAlign: 'left',
    cursor: 'pointer',
    backgroundColor: active ? color.primary : 'transparent',
    color: active ? '#fff' : color.body,
  });
  const inputStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: `1px solid ${color.inputBorder}`,
    borderRadius: '7px',
    fontSize: '12.5px',
    minHeight: '36px',
    color: color.navy,
  };
  const groupHeader: React.CSSProperties = {
    backgroundColor: '#eef1f6',
    padding: '9px 18px',
    fontFamily: font.mono,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    color: color.body,
    display: 'flex',
    justifyContent: 'space-between',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        backgroundColor: 'rgba(15,23,41,.42)',
      }}
      onClick={() => !busy && onClose()}
    >
      <div
        data-testid="add-items-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(1052px, 96vw)',
          backgroundColor: '#fff',
          boxShadow: '-18px 0 44px rgba(15,23,41,.18)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header + step indicator */}
        <div
          style={{
            padding: '14px 22px',
            borderBottom: `1px solid ${color.cardBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 800, color: color.navy }}>
            Add items {step === 1 ? '— pick' : '— set details'}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: step === 1 ? color.primary : color.success }}>
              ① Pick
            </span>
            <span style={{ fontSize: '12px', color: step === 2 ? color.primary : color.mutedAlt }}>
              ② Set details
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => !busy && onClose()}
              style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: color.muted }}
            >
              ✕
            </button>
          </div>
        </div>

        {error && (
          <div style={{ margin: '10px 22px 0', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#fdf1f0', color: color.danger, fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* Body */}
        {step === 1 ? (
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '190px minmax(0,1fr) 280px' }}>
            {/* Left rail */}
            <div style={{ borderRight: `1px solid ${color.cardBorder}`, padding: '14px 10px', overflowY: 'auto' }}>
              <div style={{ fontFamily: font.mono, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.08em', color: color.mutedAlt, margin: '0 0 6px 4px' }}>
                FROM YOUR CATALOG
              </div>
              {ITEM_TYPES.map((t) => (
                <button key={t.key} type="button" style={railBtn(source === t.key)} onClick={() => setSource(t.key)} data-testid={`sheet-source-${t.key}`}>
                  {t.label}
                  <span
                    style={{
                      fontSize: '11px',
                      borderRadius: '20px',
                      padding: '1px 7px',
                      backgroundColor: source === t.key ? 'rgba(255,255,255,.22)' : color.neutralBadgeBg,
                      color: source === t.key ? '#fff' : color.neutralBadgeText,
                    }}
                  >
                    {typeCounts.get(t.key) ?? 0}
                  </span>
                </button>
              ))}
              <div style={{ fontFamily: font.mono, fontSize: '10.5px', fontWeight: 600, letterSpacing: '0.08em', color: color.mutedAlt, margin: '14px 0 6px 4px' }}>
                OTHER SOURCES
              </div>
              <button type="button" style={railBtn(source === 'manual')} onClick={() => setSource('manual')} data-testid="sheet-source-manual">
                Type it manually
              </button>
            </div>

            {/* Middle — catalog or manual form */}
            <div style={{ overflowY: 'auto' }}>
              {source === 'manual' ? (
                <div style={{ padding: '16px 20px', maxWidth: '460px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: color.body, marginBottom: '2px' }}>Item name</label>
                  <input value={manual.name} onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))} style={{ ...inputStyle, width: '100%', marginBottom: '8px' }} placeholder="Custom iron railing, powder-coated" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: color.body, marginBottom: '2px' }}>Type</label>
                      <select value={manual.itemType} onChange={(e) => setManual((m) => ({ ...m, itemType: e.target.value as CatalogItemType }))} style={{ ...inputStyle, width: '100%' }}>
                        {ITEM_TYPES.map((t) => (
                          <option key={t.key} value={t.key}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: color.body, marginBottom: '2px' }}>Cost code</label>
                      <input value={manual.costCode} onChange={(e) => setManual((m) => ({ ...m, costCode: e.target.value }))} style={{ ...inputStyle, width: '100%' }} placeholder="06 — CARPENTRY" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: color.body, marginBottom: '2px' }}>Qty</label>
                      <input inputMode="decimal" value={manual.qty} onChange={(e) => setManual((m) => ({ ...m, qty: e.target.value }))} style={{ ...inputStyle, width: '100%', fontFamily: font.mono, textAlign: 'right' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: color.body, marginBottom: '2px' }}>
                        {catalogRowTypeFor(manual.itemType) === 'labor' ? 'Rate $/hr' : catalogRowTypeFor(manual.itemType) === 'material' ? 'Unit cost $' : 'Amount $'}
                      </label>
                      <input inputMode="decimal" value={manual.unitCost} onChange={(e) => setManual((m) => ({ ...m, unitCost: e.target.value }))} style={{ ...inputStyle, width: '100%', fontFamily: font.mono, textAlign: 'right' }} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '12.5px', color: color.body, marginTop: '10px' }}>
                    <input type="checkbox" checked={manual.saveToCatalog} onChange={(e) => setManual((m) => ({ ...m, saveToCatalog: e.target.checked }))} />
                    Save this to the cost catalog
                  </label>
                  <p style={{ fontSize: '11px', color: color.faint, margin: '2px 0 10px' }}>
                    An item typed once should never have to be typed again — untick for a genuine one-off.
                  </p>
                  <button type="button" onClick={addManualToTray} style={{ padding: '9px 16px', borderRadius: '9px', backgroundColor: color.primary, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    Add to tray
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: '8px', padding: '12px 18px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the catalog…" style={{ ...inputStyle, flex: 1, minWidth: '160px' }} />
                    {(['all', 'favorites', 'used'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setChip(c)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 600,
                          border: `1px solid ${chip === c ? color.navy : color.inputBorder}`,
                          backgroundColor: chip === c ? color.navy : '#fff',
                          color: chip === c ? '#fff' : color.body,
                          cursor: 'pointer',
                        }}
                      >
                        {c === 'all' ? 'All' : c === 'favorites' ? 'Favorites' : 'Used on this job'}
                      </button>
                    ))}
                  </div>
                  {catalog === null ? (
                    <p style={{ padding: '18px', fontSize: '13px', color: color.faint }}>Loading catalog…</p>
                  ) : grouped.length === 0 ? (
                    <p style={{ padding: '18px', fontSize: '13px', color: color.faint }}>
                      Nothing here{chip !== 'all' ? ' under this filter' : ''} — switch source, or type it manually.
                    </p>
                  ) : (
                    grouped.map(([cat, items]) => (
                      <div key={cat}>
                        <div style={groupHeader}>
                          <span>{cat}</span>
                          <span>{items.length}</span>
                        </div>
                        {items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '7px 18px 7px 34px',
                              borderBottom: `1px solid ${color.rowDivider}`,
                              backgroundColor: inTray.has(item.id) ? '#f5f7ff' : '#fff',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={inTray.has(item.id)}
                              onChange={() => togglePick(item)}
                              data-testid={`sheet-pick-${item.id}`}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: color.navy }}>{item.name}</div>
                              <div style={{ fontFamily: font.mono, fontSize: '10.5px', color: color.faint }}>
                                {item.cost_code ?? '—'}
                              </div>
                            </div>
                            <span style={{ fontSize: '11.5px', color: color.muted }}>{item.unit_of_measure}</span>
                            <span style={{ fontFamily: font.mono, fontSize: '12.5px', fontWeight: 600, color: color.navy, width: '76px', textAlign: 'right' }}>
                              {item.unit_cost != null ? fmtMoney(item.unit_cost) : '—'}
                            </span>
                            <button
                              type="button"
                              aria-label={item.is_favorite ? 'Unfavorite' : 'Favorite'}
                              onClick={() => void toggleFavorite(item)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '15px', color: item.is_favorite ? color.amber : color.faintAlt }}
                            >
                              ★
                            </button>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Right — the tray */}
            <div style={{ borderLeft: `1px solid ${color.cardBorder}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: color.navy, borderBottom: `1px solid ${color.cardBorder}` }}>
                Tray · {tray.length}
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {tray.length === 0 ? (
                  <p style={{ padding: '14px 16px', fontSize: '12.5px', color: color.faint }}>
                    Tick items to collect them here. The tray survives source switches.
                  </p>
                ) : (
                  tray.map((e) => (
                    <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderBottom: `1px solid ${color.rowDivider}` }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: '12.5px', color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.name}
                      </div>
                      <span style={{ fontFamily: font.mono, fontSize: '11.5px', color: color.muted }}>
                        {fmtMoney(basisOf(e))}
                      </span>
                      <button type="button" aria-label={`Remove ${e.name}`} onClick={() => setTray((prev) => prev.filter((t) => t.key !== e.key))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: color.faint }}>
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div style={{ borderTop: `1px solid ${color.cardBorder}`, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: color.body, marginBottom: '8px' }}>
                  <span>Cost at qty as picked</span>
                  <span style={{ fontFamily: font.mono, fontWeight: 600 }}>{fmtMoney(totals.cost)}</span>
                </div>
                <button
                  type="button"
                  disabled={tray.length === 0}
                  onClick={() => setStep(2)}
                  data-testid="sheet-next"
                  style={{ width: '100%', padding: '11px', borderRadius: '9px', backgroundColor: tray.length ? color.primary : color.faintAlt, color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: tray.length ? 'pointer' : 'not-allowed' }}
                >
                  Next — set details
                </button>
                <p style={{ fontSize: '10.5px', color: color.faint, margin: '6px 0 0', textAlign: 'center' }}>
                  Nothing is written to the estimate until step 2.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ── Step 2 ── */
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Apply-to-all bar */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 22px', borderBottom: `1px solid ${color.cardBorder}`, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: color.body }}>Apply to all:</span>
              <input value={applyMarkup} onChange={(e) => setApplyMarkup(e.target.value)} placeholder="Markup %" inputMode="decimal" style={{ ...inputStyle, width: '90px', fontFamily: font.mono, textAlign: 'right' }} />
              <select value={applySection} onChange={(e) => setApplySection(e.target.value)} style={{ ...inputStyle, minWidth: '180px' }}>
                <option value="">Section…</option>
                {lineItems.map((li) => (
                  <option key={li.id} value={li.id}>{lineItemLabel.get(li.id)}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setTray((prev) =>
                    prev.map((t) => ({
                      ...t,
                      ...(applyMarkup.trim() !== '' ? { markup: applyMarkup.trim() } : {}),
                      ...(applySection ? { lineItemId: applySection } : {}),
                    }))
                  );
                }}
                style={{ padding: '7px 13px', borderRadius: '8px', backgroundColor: '#f2f4ff', border: '1px solid #dbe0fb', color: color.primary, fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                Apply
              </button>
              <span style={{ fontSize: '11px', color: color.faint }}>
                Markup left blank inherits the estimate default for that row type.
              </span>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {step2Groups.map((g) => (
                <div key={g.label}>
                  <div style={groupHeader}>
                    <span>{g.label}</span>
                    <span style={{ fontFamily: font.mono }}>
                      subtotal {fmtMoney(g.entries.reduce((s, e) => s + sellOf(e), 0))}
                    </span>
                  </div>
                  {g.entries.map((e) => (
                    <div key={e.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 74px 90px 90px 80px 100px 190px 30px', gap: '8px', alignItems: 'center', padding: '6px 18px', borderBottom: `1px solid ${color.rowDivider}` }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: color.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                        <div style={{ fontFamily: font.mono, fontSize: '10px', color: color.faint }}>{e.costCode ?? e.rowType}</div>
                      </div>
                      {e.rowType === 'labor' || e.rowType === 'material' ? (
                        <input aria-label="Qty" inputMode="decimal" value={e.qty} onChange={(ev) => patchEntry(e.key, { qty: ev.target.value })} style={{ ...inputStyle, fontFamily: font.mono, textAlign: 'right' }} />
                      ) : (
                        <span style={{ fontSize: '11px', color: color.faint, textAlign: 'center' }}>—</span>
                      )}
                      <span style={{ fontSize: '11.5px', color: color.muted }}>
                        {e.rowType === 'material' ? e.unit : e.rowType === 'labor' ? 'hours' : 'amount'}
                      </span>
                      <input aria-label="Unit cost" inputMode="decimal" value={e.unitCost} onChange={(ev) => patchEntry(e.key, { unitCost: ev.target.value })} style={{ ...inputStyle, fontFamily: font.mono, textAlign: 'right' }} />
                      <input
                        aria-label="Markup %"
                        inputMode="decimal"
                        value={e.markup}
                        placeholder={inheritedMarkup(e.rowType) != null ? String(inheritedMarkup(e.rowType)) : '—'}
                        onChange={(ev) => patchEntry(e.key, { markup: ev.target.value })}
                        style={{ ...inputStyle, fontFamily: font.mono, textAlign: 'right' }}
                      />
                      <span style={{ fontFamily: font.mono, fontSize: '12.5px', fontWeight: 600, color: color.navy, textAlign: 'right' }}>
                        {fmtMoney(sellOf(e))}
                      </span>
                      <select aria-label="Section" value={e.lineItemId} onChange={(ev) => patchEntry(e.key, { lineItemId: ev.target.value })} style={{ ...inputStyle, minWidth: 0 }}>
                        {lineItems.map((li) => (
                          <option key={li.id} value={li.id}>{lineItemLabel.get(li.id)}</option>
                        ))}
                      </select>
                      <button type="button" aria-label={`Remove ${e.name}`} onClick={() => setTray((prev) => prev.filter((t) => t.key !== e.key))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: color.faint }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Action strip — fixed, outside the scroll (the handoff's rule) */}
            <div style={{ display: 'flex', gap: '10px', padding: '10px 22px', borderTop: `1px solid ${color.cardBorder}` }}>
              <button type="button" onClick={() => setStep(1)} style={{ padding: '9px 15px', borderRadius: '9px', backgroundColor: '#fff', border: `1px solid ${color.inputBorder}`, color: color.body, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                ← Back to picking
              </button>
              <button
                type="button"
                onClick={() => {
                  setSource('manual');
                  setStep(1);
                }}
                style={{ padding: '9px 15px', borderRadius: '9px', backgroundColor: '#fff', border: `1px solid ${color.inputBorder}`, color: color.body, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                One-off line
              </button>
            </div>

            {/* Totals footer */}
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', padding: '12px 22px', backgroundColor: color.navy, color: '#fff', fontSize: '13px' }}>
              <span>
                Cost <strong style={{ fontFamily: font.mono }}>{fmtMoney(totals.cost)}</strong>
              </span>
              <span>
                Markup <strong style={{ fontFamily: font.mono }}>{fmtMoney(totals.markup)}</strong>
              </span>
              <span>
                Adds to estimate{' '}
                <strong style={{ fontFamily: font.mono, color: color.amber }}>{fmtMoney(totals.sell)}</strong>
              </span>
              <span style={{ flex: 1 }} />
              <button type="button" disabled={busy} onClick={() => !busy && onClose()} style={{ padding: '9px 15px', borderRadius: '9px', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,.4)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="button"
                data-testid="sheet-confirm"
                disabled={busy || tray.length === 0}
                onClick={() => void confirmAdd()}
                style={{ padding: '10px 18px', borderRadius: '9px', backgroundColor: color.primary, border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}
              >
                {busy ? 'Adding…' : `Add ${tray.length} item${tray.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
