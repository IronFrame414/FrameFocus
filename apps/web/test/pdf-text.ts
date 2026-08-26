import zlib from 'node:zlib';

// Shared by every test that asserts on a REAL rendered PDF
// (brand-pdf-footer.test.tsx and s175-spec-sheet-template.test.tsx). Extracted
// at S175 stage 6 rather than pasted a second time: two copies of a decoder
// this fiddly would drift, and the second copy is exactly the shape CLAUDE.md's
// PARITY rule calls "the divergence, written in a form that looks like
// agreement".

/**
 * ⚠️ SKIP THE STREAMS THAT ARE NOT TEXT — added [S175 stage 6].
 *
 * A PDF with an EMBEDDED IMAGE breaks a naive decoder, and it breaks it in the
 * most misleading way available: an inflated PNG XObject is raw pixel data, a
 * DCTDecode JPEG fails to inflate at all and its raw bytes get appended
 * instead, and either way the binary both swamps the real text and offers
 * random byte runs for the `<hex> Tj` and `[…] TJ` patterns below to match. The
 * result is not "the string is missing" — it is a wall of garbage in which
 * every assertion fails and none of them says why.
 *
 * The three field PDFs this file was written for happened to carry no images
 * in their fixtures. The specifications sheet carries the tenant's logo and an
 * image per selection, so it hit this immediately.
 *
 * A page's content stream always brackets its text in BT … ET and is almost
 * entirely printable; a pixel buffer is neither. Requiring both is enough to
 * separate them, and skipping a non-text stream can never hide an assertion —
 * there is no readable text in one to begin with.
 */
function isContentStream(decoded: string): boolean {
  if (!/\bBT\b/.test(decoded) || !/\bET\b/.test(decoded)) return false;
  let printable = 0;
  for (let i = 0; i < decoded.length; i += 1) {
    const c = decoded.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126)) printable += 1;
  }
  return printable / Math.max(decoded.length, 1) > 0.9;
}

/**
 * Pull readable text out of a real PDF.
 *
 * Three steps, all necessary:
 *   1. Inflate the Flate-compressed content streams, keeping only the ones
 *      that are actually text (see isContentStream above).
 *   2. Decode the hex string tokens. @react-pdf does NOT write literal text —
 *      it emits `[<455a20436f6e7472> 10 <6163746f722042696e646572> 0] TJ`,
 *      i.e. hex-encoded runs split at kerning pairs. Grepping the inflated
 *      stream for ASCII finds nothing even when the text is plainly there.
 *   3. ⚠️ RETURN THE RUNS AND NOTHING ELSE — [S175 stage 6].
 *
 * Step 3 was the defect. This function used to REPLACE each TJ group in place
 * and return the whole stream, operators included. That works only while a
 * string happens to land in one group, and @react-pdf splits a single line
 * across several complete BT…ET blocks whenever the glyph positioning changes:
 *
 *     BT … [<33> 0] TJ ET  Q  1 0 0 1 5.56 0 cm  q  BT … [<636d2065617365…>] TJ ET
 *
 * — which is the ONE LINE "3cm eased edge", and in the old output there were
 * forty characters of PDF operators sitting between the "3" and the "cm". The
 * three field PDFs it was written for never tripped it because their asserted
 * strings each fell inside one group; a spec detail beginning with a digit
 * tripped it immediately, and the failure read as "the text is not on the
 * page" rather than as a decoder that cannot rejoin a line.
 *
 * ⚠️ THE RUNS ARE JOINED WITH NOTHING, which is correct within a line and
 * merges across them: the last word of one paragraph abuts the first word of
 * the next. That is deliberate — a separator would re-break the split above,
 * which is the case that matters — and it errs the safe way: it can only make
 * a `not.toContain` fail, never pass.
 */
export function pdfText(buf: Buffer): string {
  const bin = buf.toString('latin1');
  const decodeRun = (inner: string): string => {
    let out = '';
    const tok = /<([0-9A-Fa-f\s]*)>/g;
    let t: RegExpExecArray | null;
    while ((t = tok.exec(inner)) !== null) {
      out += Buffer.from(t[1].replace(/\s+/g, ''), 'hex').toString('latin1');
    }
    return out;
  };

  let streams = '';
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bin)) !== null) {
    const raw = Buffer.from(m[1], 'latin1');
    let decoded: string;
    try {
      decoded = zlib.inflateSync(raw).toString('latin1');
    } catch {
      decoded = raw.toString('latin1');
    }
    if (isContentStream(decoded)) streams += decoded;
  }

  // Every text-showing operator, in document order, and only those.
  let text = '';
  const show = /\[([^\]]*)\]\s*TJ|<([0-9A-Fa-f\s]+)>\s*Tj/g;
  let g: RegExpExecArray | null;
  while ((g = show.exec(streams)) !== null) {
    text += g[1] !== undefined ? decodeRun(g[1]) : decodeRun(`<${g[2]}>`);
  }
  return text;
}
