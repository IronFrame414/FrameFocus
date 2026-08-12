/**
 * S138 — what "everything, per-category selection" actually means.
 *
 * ⚠️ A CURATED MAP, NOT `COMPANY_TABLES`. The deletion job walks ~71 tables
 * because it must leave nothing behind. An export is read by a human, so a
 * dump of every join table would be worse than useless. These are the
 * categories a contractor would recognise, each naming its tables explicitly
 * so adding a table to the schema does not silently change what customers get.
 *
 * ⚠️ IF YOU ADD A TABLE TO THE SCHEMA, IT IS NOT EXPORTED UNTIL IT IS LISTED
 * HERE. That is deliberate — the alternative is a reflective walk that leaks
 * whatever the next migration happens to add.
 */

export interface ExportCategory {
  /** Stable key stored in `export_jobs.categories`. Never rename in place. */
  key: string;
  label: string;
  /** Tables dumped for this category, in the order a reader would want them. */
  tables: string[];
  /**
   * True when this category's rows reference storage objects that the `files`
   * category is responsible for. Used for the broken-reference rule below.
   */
  referencesFiles?: boolean;
}

export const EXPORT_CATEGORIES: ExportCategory[] = [
  {
    key: 'company',
    label: 'Company & people',
    tables: ['companies', 'profiles', 'company_members', 'subscriptions'],
  },
  {
    key: 'contacts',
    label: 'Contacts & subcontractors',
    tables: ['contacts', 'contact_addresses', 'subcontractors'],
  },
  {
    key: 'estimates',
    label: 'Estimates & proposals',
    tables: ['estimates', 'estimate_items'],
  },
  {
    key: 'projects',
    label: 'Projects & schedule',
    tables: ['projects', 'project_assignments', 'tasks'],
    referencesFiles: true,
  },
  {
    key: 'change_orders',
    label: 'Change orders',
    tables: ['change_orders', 'change_order_line_items', 'change_order_line_rows'],
  },
  {
    key: 'budget',
    label: 'Budget & job costs',
    // ⚠️ Owner/Admin-only side tables ARE included. The export is Owner/Admin
    // gated (route + export_jobs RLS), and the Financial Visibility Floor is a
    // rule about which ROLES see money, not about whether the customer owns
    // their own figures. Withholding them would ship an export that silently
    // omits the contract value.
    tables: [
      'project_budget_items',
      'project_budget_amounts',
      'project_financials',
      'instrument_rates',
    ],
    referencesFiles: true,
  },
  {
    key: 'field',
    label: 'Daily logs, punch lists & deliveries',
    tables: ['daily_logs', 'punch_lists', 'punch_list_items', 'deliveries', 'delivery_items'],
    referencesFiles: true,
  },
  {
    key: 'time',
    label: 'Time & timesheets',
    tables: ['time_entries', 'timesheets'],
  },
  {
    key: 'chat',
    label: 'Chat log',
    tables: ['chat_threads', 'chat_messages'],
    referencesFiles: true,
  },
  {
    key: 'files',
    label: 'Files & photos',
    // The `files` ROWS always come with this category; the BYTES are fetched
    // from storage separately (see runExportChunk's file phase).
    tables: ['files'],
  },
];

export const EXPORT_CATEGORY_KEYS = EXPORT_CATEGORIES.map((c) => c.key);

export function categoriesFor(keys: string[]): ExportCategory[] {
  return EXPORT_CATEGORIES.filter((c) => keys.includes(c.key));
}

/**
 * ⚠️ THE BROKEN-REFERENCE RULE [Josh]: export "budget" without "files" and the
 * row KEEPS THE FILENAME and OMITS THE FILE.
 *
 * The row is never rewritten and the reference is never nulled — a receipt id
 * that points at nothing still tells the reader a receipt existed, which is
 * the fact they need when reconciling. What would be dishonest is a manifest
 * that does not say the bytes are absent, so the export writes
 * `MISSING-FILES.txt` naming every referenced object it did not include and
 * why.
 */
export function filesAreIncluded(keys: string[]): boolean {
  return keys.includes('files');
}
