import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { fitTextToBox, type BoxKind } from '@/lib/services/lien-releases-shared';

// Module 7F — the renderer. OVERLAY ONLY (§2, §11.3).
//
// The product supplies NO page content: not the body wording, not the notary
// block, not the printed title. The company's uploaded PDF *is* the legal
// instrument, and this stamps values into boxes the company placed on it.
//
// The pattern ships twice already — proposal-service.ts `compositeSignedPDF`
// and co-pdf-service.ts — so this is a variation on working code rather than
// a new capability. What is new is that the coordinates come from a stored box
// map instead of being hard-coded to a template the product authored.
//
// ⚠️ COORDINATE SYSTEMS. Boxes are stored as FRACTIONS with the origin at the
// TOP-LEFT, which is how a person places a box while looking at a page. pdf-lib
// draws from the BOTTOM-LEFT. The flip happens in exactly one place below; if
// stamped text ever appears mirrored vertically, that is the line.

export interface PlacedBox {
  page: number;
  /** Fractions of page width/height, origin TOP-LEFT. */
  x: number;
  y: number;
  width: number;
  height: number;
  kind: BoxKind;
  value_key: string | null;
  custom_label: string | null;
}

export interface RenderInput {
  /** The company's own uploaded form. Never generated. */
  templatePdf: Buffer;
  boxes: PlacedBox[];
  /** Resolved and user-edited values, keyed by value_key or custom_label. */
  values: Record<string, string>;
  /** PNG bytes of companies.contractor_signature_path. */
  signatureImage?: Buffer | null;
  /**
   * §7 step 5 / [ruling C4, S140] — on the notary path the signature area is
   * left BLANK. A notary attests to a signature made in their presence, so a
   * pre-stamped image defeats the acknowledgment; blank is the safer error.
   */
  notaryRequired: boolean;
}

export interface RenderResult {
  pdf: Buffer;
  /** Boxes whose text had to shrink — surfaced in the review step (§7). */
  shrunkBoxes: string[];
  /** Boxes whose text does not fit even at the floor size. */
  overflowedBoxes: string[];
}

const BASE_FONT_SIZE = 10;

export async function renderRelease(input: RenderInput): Promise<RenderResult> {
  const pdfDoc = await PDFDocument.load(input.templatePdf);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  let signature: PDFImage | null = null;
  // The `notaryRequired` check comes FIRST, so a notary release cannot embed a
  // signature even if one was passed. Ordering is the guarantee here.
  if (!input.notaryRequired && input.signatureImage) {
    try {
      signature = await pdfDoc.embedPng(input.signatureImage);
    } catch {
      // A malformed signature must not fail a legal document silently or
      // loudly — the box simply stays blank, exactly as on the notary path.
      signature = null;
    }
  }

  const shrunkBoxes: string[] = [];
  const overflowedBoxes: string[] = [];

  for (const box of input.boxes) {
    const page = pages[box.page];
    if (!page) continue; // a box pointing past the end of a replaced PDF

    const { width: pw, height: ph } = page.getSize();
    const boxW = box.width * pw;
    const boxH = box.height * ph;
    const boxX = box.x * pw;
    // THE FLIP: stored y is measured from the TOP; pdf-lib measures from the
    // BOTTOM. The box's bottom edge is therefore page height minus its top
    // minus its own height.
    const boxBottomY = ph - box.y * ph - boxH;

    if (box.kind === 'signature') {
      if (!signature) continue; // notary path, or no signature on file
      const scale = Math.min(boxW / signature.width, boxH / signature.height);
      const drawW = signature.width * scale;
      const drawH = signature.height * scale;
      page.drawImage(signature, {
        x: boxX,
        y: boxBottomY,
        width: drawW,
        height: drawH,
      });
      continue;
    }

    const key = box.kind === 'value' ? box.value_key : box.custom_label;
    if (!key) continue;
    const text = input.values[key];
    if (!text) continue; // blank is legal — §6.3's null paths

    // Multi-line values (addresses) stack downward from the box top.
    const lines = text.split('\n');
    const lineHeight = Math.min(BASE_FONT_SIZE * 1.15, boxH / Math.max(lines.length, 1));

    let smallest = BASE_FONT_SIZE;
    for (const line of lines) {
      // Average advance at size 1, measured from the embedded font so the fit
      // math stays honest about the glyphs actually being drawn.
      const perChar = averageCharWidth(font, line);
      const fit = fitTextToBox(line, boxW, BASE_FONT_SIZE, perChar);
      if (fit.shrunk) shrunkBoxes.push(key);
      if (fit.overflows) overflowedBoxes.push(key);
      smallest = Math.min(smallest, fit.fontSize);
    }

    lines.forEach((line, i) => {
      page.drawText(line, {
        x: boxX + 1,
        // Baseline sits just inside the box top, then steps down per line.
        y: boxBottomY + boxH - lineHeight * (i + 1) + lineHeight * 0.25,
        size: smallest,
        font,
        color: rgb(0, 0, 0),
      });
    });
  }

  const bytes = await pdfDoc.save();
  return {
    pdf: Buffer.from(bytes),
    shrunkBoxes: [...new Set(shrunkBoxes)],
    overflowedBoxes: [...new Set(overflowedBoxes)],
  };
}

/**
 * Average per-character advance at size 1 for THIS string in THIS font.
 *
 * Measured rather than assumed: Helvetica's advance varies by more than 3x
 * between 'i' and 'W', so a fixed 0.5 would let a wide string overflow a box
 * it was told fit. Falls back to 0.5 on an empty string.
 */
function averageCharWidth(font: PDFFont, text: string): number {
  if (!text.length) return 0.5;
  return font.widthOfTextAtSize(text, 1) / text.length;
}
