import zlib from 'node:zlib';

// Shared by every test that asserts on a REAL rendered PDF
// (brand-pdf-footer.test.tsx and s175-spec-sheet-template.test.tsx). Extracted
// at S175 stage 6 rather than pasted a second time: two copies of a decoder
// this fiddly would drift, and the second copy is exactly the shape CLAUDE.md's
// PARITY rule calls "the divergence, written in a form that looks like
// agreement".

/**
 * Pull readable text out of a real PDF.
 *
 * Two steps, both necessary:
 *   1. Inflate the Flate-compressed content streams.
 *   2. Decode the hex string tokens. @react-pdf does NOT write literal text —
 *      it emits `[<455a20436f6e7472> 10 <6163746f722042696e646572> 0] TJ`,
 *      i.e. hex-encoded runs split at kerning pairs. Grepping the inflated
 *      stream for ASCII finds nothing even when the text is plainly there.
 *      Concatenating the hex tokens in order rejoins the split runs.
 */
export function pdfText(buf: Buffer): string {
  const bin = buf.toString('latin1');
  let streams = '';
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bin)) !== null) {
    const raw = Buffer.from(m[1], 'latin1');
    try {
      streams += zlib.inflateSync(raw).toString('latin1');
    } catch {
      streams += raw.toString('latin1');
    }
  }
  // A TJ array interleaves hex runs with kerning numbers:
  //   [<455a20436f6e7472> 10 <6163746f722042696e646572> 0] TJ
  // Collect ONLY the hex tokens, in order, and concatenate — that rejoins the
  // split run. Dropping the numbers by regex after decoding would also eat
  // digits that are legitimately part of the text (dates, quantities).
  const decodeRun = (inner: string): string => {
    let out = '';
    const tok = /<([0-9A-Fa-f\s]*)>/g;
    let t: RegExpExecArray | null;
    while ((t = tok.exec(inner)) !== null) {
      out += Buffer.from(t[1].replace(/\s+/g, ''), 'hex').toString('latin1');
    }
    return out;
  };

  return streams
    .replace(/\[([^\]]*)\]\s*TJ/g, (_all, inner: string) => decodeRun(inner))
    .replace(/<([0-9A-Fa-f\s]+)>\s*Tj/g, (_all, hex: string) => decodeRun(`<${hex}>`));
}
