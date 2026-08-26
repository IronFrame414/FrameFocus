import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getProjectSelections } from '@/lib/services/selections';
import { downloadImageBase64 } from '@/lib/change-orders/co-data';

// ============================================================================
// Allowances & Selections — STAGE 6: the specifications sheet's DATA.
// Spec: docs/specs/allowances-selections-spec.md §7.3, §9.4. [S175 item 4]
// ============================================================================
//
// ⚠️ THE TYPE IS THE CONTRACT, AND IT CARRIES NO MONEY.
//
// There is not an amount, a markup, a variance, a sell figure or a unit cost
// anywhere in `SelectionSpecSheetData`, so a future edit cannot "just show the
// price" without changing this type — the same device §9.2's tab props use,
// for the same reason.
//
// §7.3: *"approved selections to date, grouped by area — image, chosen option,
// spec detail, vendor/link. **One rendering, no costs.**"* §9.4 repeats it in
// four words: *"No money."*
//
// ⚠️ AND THAT IS A FLOOR DECISION, NOT A LAYOUT PREFERENCE. The sheet is filed
// to project files under `category = 'selections'`, and `files_select_non_client`
// (20260728000000) gates only contracts/change_orders/invoices — so a
// FOREMAN, a CREW MEMBER and a SUBCONTRACTOR who can view the project can all
// read this row. A sell figure on it would hand those three roles a sell
// amount at the DATABASE, which is exactly what the Financial Visibility Floor
// forbids and what splitting `project_budget_amounts` off its parent was done
// to prevent. Putting money on this sheet therefore is not a one-line change:
// it needs the category moved into the gated set FIRST, and that would in turn
// stop the field reading the sheet at all.
//
// ⚠️ `selection-money.ts` IS DELIBERATELY NOT IMPORTED HERE. Stage 5 made it
// the ONE implementation of "fixed or as-incurred", and the instruction that
// came with it is that nothing computes selection money a second way. This
// module honours that in the only way a no-money document can: it computes
// none. If the sheet ever gains a figure, it comes from there and from nowhere
// else.
//
// ---------------------------------------------------------------------------
// WHAT IS ON IT
// ---------------------------------------------------------------------------
// Q4.3 — APPROVED SELECTIONS ONLY, stamped "approved as of <date>". A build
// document listing unapproved choices invites the crew to install one; the
// date stamp is what makes the snapshot honest, and it is repeated in the
// FIXED footer so a page torn off and carried onto the site still carries it.
//
// Q4.4 — A CLIENT-SUPPLIED SELECTION IS LISTED AND MARKED. It carries no money
// at all by ruling (the `selections` CHECK makes every stamp NULL), but the
// fixture still has to be installed, so omitting it hands the crew an
// incomplete list. It appears with its chosen option, spec detail and image,
// and says plainly "Supplied by client — no charge".
//
// ---------------------------------------------------------------------------
// WHERE THE IMAGES COME FROM
// ---------------------------------------------------------------------------
// `selection_option_images()` — the S172 SECURITY DEFINER read, keyed on the
// selection: *"if you can see the selection, you can see its option images."*
// It is called through the CALLER'S client so a caller who cannot see a
// selection embeds nothing from it, and the BYTES are then fetched with the
// admin client — the same split `signSelectionOptionImages()` makes, for the
// reason stated there: storage RLS keys on `files.client_visible`, and that
// flag is deliberately not involved in option images.
//
// react-pdf decodes only JPEG and PNG. Anything else (HEIC off an iPhone,
// webp) would fail the WHOLE render if fed in as a data URI, so it is listed
// without a picture rather than risking the document — the daily-log lesson,
// verbatim.
// ============================================================================

type Db = SupabaseClient<Database>;

const BUCKET = 'project-files';
const EMBEDDABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

/**
 * Total embedded images, across the whole sheet. Images are the POINT of this
 * document, so the cap is far higher than the daily log's 12 — but a cap has
 * to exist, because a 40-selection project would otherwise render a PDF whose
 * size is set by the client's camera. A selection past the cap still appears
 * in full with its text; only the picture is missing, and the footer says how
 * many.
 */
export const MAX_EMBEDDED_IMAGES = 60;

export interface SpecSheetOption {
  name: string;
  specDetail: string | null;
  linkUrl: string | null;
  /** JPEG/PNG data URI, or null: no image, an unembeddable type, or past the cap. */
  imageDataUri: string | null;
}

export interface SpecSheetSelection {
  id: string;
  name: string;
  description: string | null;
  /** Q4.4 — rendered as "Supplied by client — no charge", never as a blank. */
  clientSupplied: boolean;
  /** ISO; the client's signature. Present on every approved selection. */
  approvedAt: string | null;
  chosen: SpecSheetOption[];
}

export interface SpecSheetArea {
  id: string;
  name: string;
  selections: SpecSheetSelection[];
}

export interface SelectionSpecSheetData {
  company: {
    name: string;
    logoUrl: string | null;
    brandColor: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
    email: string | null;
    licenseNumber: string | null;
    timezone: string | null;
  };
  project: { id: string; name: string };
  /** The project's primary contact, when there is one. */
  clientName: string | null;
  areas: SpecSheetArea[];
  selectionCount: number;
  /** Q4.3 — ISO instant the snapshot was taken. "Approved as of ...". */
  approvedAsOf: string;
  /** Images left out: past the cap, or a type react-pdf cannot decode. */
  imagesOmitted: number;
}

/**
 * Assemble the sheet for a project's APPROVED selections.
 *
 * Reads go through the caller's RLS client — a caller who cannot see the
 * project's selections builds an empty sheet — except the company, project and
 * contact rows, which are read with the ADMIN client for selection-email.ts's
 * reason verbatim: a PM may act on a selection without being able to read
 * `contacts` at all (Roster Visibility Floor), and that must not turn into a
 * document with a blank client name.
 *
 * Returns null when the project itself is unreadable.
 */
export async function getSelectionSpecSheetData(
  rls: Db,
  admin: Db,
  projectId: string,
  now: Date = new Date()
): Promise<SelectionSpecSheetData | null> {
  const { data: project } = await rls
    .from('projects')
    .select('id, name, company_id, contact_id')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: company } = await admin
    .from('companies')
    .select(
      'name, logo_url, brand_color, address_line1, address_line2, city, state, zip, phone, email, license_number, timezone'
    )
    .eq('id', project.company_id)
    .maybeSingle();
  if (!company) return null;

  let clientName: string | null = null;
  if (project.contact_id) {
    const { data: contact } = await admin
      .from('contacts')
      .select('first_name, last_name, company_name')
      .eq('id', project.contact_id)
      .maybeSingle();
    if (contact) {
      clientName =
        `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() ||
        contact.company_name ||
        null;
    }
  }

  // ONE reader of a project's selections, shared with both §9.2 surfaces —
  // a second "does the same thing" query is the #129 divergence written as
  // agreement. Money comes back on it for an Owner/Admin/PM caller and is
  // dropped HERE, at the boundary, exactly as the §9.2 page drops it.
  const areasWithEverything = await getProjectSelections(projectId, rls);

  let imagesOmitted = 0;
  let embedded = 0;
  const areas: SpecSheetArea[] = [];

  for (const area of areasWithEverything) {
    const approved = area.selections.filter((s) => s.status === 'approved');
    if (!approved.length) continue;

    const selections: SpecSheetSelection[] = [];
    for (const s of approved) {
      // An approved selection always has at least one pick — the signature
      // refuses with nothing chosen (§6.2). The fallback is defensive: a
      // selection with no chosen option still LISTS, because a build document
      // that silently drops a row is worse than one that says it has none.
      const chosenRows = s.options.filter((o) => o.is_chosen);

      const wanted = new Map<string, { file_path: string; mime_type: string }>();
      if (chosenRows.length) {
        const { data: images } = await rls.rpc('selection_option_images', {
          p_selection_id: s.id,
        });
        const chosenIds = new Set(chosenRows.map((o) => o.id));
        for (const row of (images ?? []) as {
          option_id: string;
          kind: string;
          file_path: string;
          mime_type: string;
        }[]) {
          if (!chosenIds.has(row.option_id)) continue;
          // The option's own image wins over the link thumbnail; the RPC
          // returns images first, so only fill an empty slot.
          if (row.kind === 'link_thumbnail' && wanted.has(row.option_id)) continue;
          if (row.kind === 'image' || !wanted.has(row.option_id)) {
            wanted.set(row.option_id, { file_path: row.file_path, mime_type: row.mime_type });
          }
        }
      }

      const chosen: SpecSheetOption[] = [];
      for (const o of chosenRows) {
        const image = wanted.get(o.id);
        let imageDataUri: string | null = null;
        if (image) {
          if (!EMBEDDABLE_MIME_TYPES.has(image.mime_type) || embedded >= MAX_EMBEDDED_IMAGES) {
            imagesOmitted += 1;
          } else {
            const base64 = await downloadImageBase64(admin, BUCKET, image.file_path);
            if (base64) {
              imageDataUri = `data:${image.mime_type};base64,${base64}`;
              embedded += 1;
            } else {
              imagesOmitted += 1;
            }
          }
        }
        chosen.push({
          name: o.name,
          specDetail: o.spec_detail,
          linkUrl: o.link_url,
          imageDataUri,
        });
      }

      selections.push({
        id: s.id,
        name: s.name,
        description: s.description,
        clientSupplied: s.client_supplied,
        approvedAt: s.signed_at,
        chosen,
      });
    }

    areas.push({ id: area.id, name: area.name, selections });
  }

  return {
    company: {
      name: company.name,
      logoUrl: company.logo_url,
      brandColor: company.brand_color || '#1a56db',
      addressLine1: company.address_line1,
      addressLine2: company.address_line2,
      city: company.city,
      state: company.state,
      zip: company.zip,
      phone: company.phone,
      email: company.email,
      licenseNumber: company.license_number,
      timezone: company.timezone,
    },
    project: { id: project.id, name: project.name },
    clientName,
    areas,
    selectionCount: areas.reduce((n, a) => n + a.selections.length, 0),
    approvedAsOf: now.toISOString(),
    imagesOmitted,
  };
}
