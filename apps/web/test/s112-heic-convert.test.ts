import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { derivativePathFor, thumbPathFor } from '@framefocus/shared/utils/markup';
import * as heic from '../../../scripts/s112-heic-convert.cjs';

// [S112 R7] The pure parts of the one-time HEIC → JPEG conversion. Nothing here
// touches a database or Storage: every I/O dependency is a local fake.
//
// Every positive assertion has a CONTROL beside it that must fire — a probe
// that cannot fail proves nothing (CLAUDE.md, "the thing inspected").

const OLD = 'co-uuid/proj-uuid/1712-IMG_0042.HEIC';
const NEW = `${OLD}.jpg`;
const M = { version: 1, imageWidth: 10, imageHeight: 10, shapes: [{ type: 'line', x1: 0, y1: 0, x2: 5, y2: 5 }] };

describe('S112 path mapping', () => {
  it('new path is the whole old path plus .jpg — same folder, company_id first segment kept', () => {
    expect(heic.newPathFor(OLD)).toBe(NEW);
    expect(NEW.split('/')[0]).toBe('co-uuid');
  });
  it('CONTROL: an empty path is refused, not mapped to ".jpg"', () => {
    expect(() => heic.newPathFor('')).toThrow();
  });

  it('file name follows files-client convertHeicToJpeg(): strip .heic/.heif, append .jpg', () => {
    expect(heic.jpegNameFor('IMG_0042.HEIC')).toBe('IMG_0042.jpg');
    expect(heic.jpegNameFor('shot.heif')).toBe('shot.jpg');
    // CONTROL: a name without the extension (mime-only category) gains .jpg, keeps its stem
    expect(heic.jpegNameFor('photo')).toBe('photo.jpg');
    expect(heic.jpegNameFor('a.heic.png')).toBe('a.heic.png.jpg');
  });

  it('category: mime wins, name-only is reported apart, and a JPEG is not a candidate', () => {
    expect(heic.heicCategory({ mime_type: 'image/heic', file_name: 'x' })).toBe('mime');
    expect(heic.heicCategory({ mime_type: 'image/HEIF', file_name: 'x' })).toBe('mime');
    expect(heic.heicCategory({ mime_type: 'application/octet-stream', file_name: 'x.HEIC' })).toBe('name_only');
    // CONTROL
    expect(heic.heicCategory({ mime_type: 'image/jpeg', file_name: 'x.jpg' })).toBeNull();
  });

  it('already-converted rows are recognised (resumable); an unconverted one is not', () => {
    expect(heic.isAlreadyConverted({ file_path: NEW, mime_type: 'image/jpeg' })).toBe(true);
    expect(heic.isAlreadyConverted({ file_path: OLD, mime_type: 'image/heic' })).toBe(false);
  });
});

describe('S112 side objects — the file_path trap', () => {
  const plainThumb = thumbPathFor(OLD, null);
  const markedThumb = thumbPathFor(OLD, M);
  const deriv = derivativePathFor(OLD);
  const listing = [
    OLD,
    plainThumb,
    markedThumb,
    deriv,
    // must NOT be picked up:
    'co-uuid/proj-uuid/1712-IMG_0042.HEIC-other.thumb.webp', // sibling sharing a prefix
    'co-uuid/proj-uuid/1712-IMG_0042.HEIC.mZZZZZZZZ.thumb.webp', // not 8 hex
    'co-uuid/other-proj/1712-IMG_0042.HEIC.thumb.webp', // another folder
  ];

  it('maps plain AND marked thumbnails and the derivative to the same suffix on the new path', () => {
    const plan = heic.sideObjectPlan(OLD, NEW, listing);
    expect(plan).toEqual(
      [
        { kind: 'derivative', from: deriv, to: derivativePathFor(NEW) },
        { kind: 'thumbnail', from: markedThumb, to: thumbPathFor(NEW, M) },
        { kind: 'thumbnail', from: plainThumb, to: thumbPathFor(NEW, null) },
      ].sort((a, b) => (a.to < b.to ? -1 : 1))
    );
  });

  it('the fingerprint depends on markup_data only, so the copied marked thumb is where the app will look', () => {
    const plan = heic.sideObjectPlan(OLD, NEW, listing);
    const marked = plan.find((p: { from: string }) => p.from === markedThumb);
    expect(marked?.to).toBe(thumbPathFor(NEW, M));
    expect(marked?.to).toBe(heic.thumbPathFor(NEW, M));
  });

  it('CONTROL: an original with no side objects plans no copies', () => {
    expect(heic.sideObjectPlan(OLD, NEW, [OLD])).toEqual([]);
  });

  it('CONTROL: the new path\'s own thumbnails are never treated as the old path\'s', () => {
    const plan = heic.sideObjectPlan(OLD, NEW, [OLD, `${NEW}.thumb.webp`, `${NEW}.markup.jpg`]);
    expect(plan).toEqual([]);
  });

  it('an existing target name is a conflict; a free one is not', () => {
    const plan = heic.sideObjectPlan(OLD, NEW, listing);
    expect(heic.targetConflicts(NEW, plan, listing)).toEqual([]);
    // CONTROL: the new path already exists → the row must be skipped
    expect(heic.targetConflicts(NEW, plan, [...listing, NEW])).toEqual([NEW]);
    expect(heic.targetConflicts(NEW, plan, [...listing, thumbPathFor(NEW, M)])).toEqual([thumbPathFor(NEW, M)]);
  });

  it('planRow reports original presence and markup', () => {
    const p = heic.planRow({ id: 'r1', file_path: OLD, file_name: 'IMG_0042.HEIC', mime_type: 'image/heic', markup_data: M }, listing);
    expect(p.original_present).toBe(true);
    expect(p.has_markup).toBe(true);
    expect(p.new_name).toBe('IMG_0042.jpg');
    // CONTROL
    expect(heic.planRow({ id: 'r1', file_path: OLD, file_name: 'a', mime_type: 'image/heic', markup_data: null }, []).original_present).toBe(false);
  });
});

function jpegBytes(width: number, height: number): Uint8Array {
  // SOI, APP0 (len 16), SOF0 (len 17): P, H, W, …
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
}

describe('S112 JPEG checks', () => {
  it('FF D8 FF is JPEG', () => {
    expect(heic.isJpegMagic(jpegBytes(1, 1))).toBe(true);
  });
  it('CONTROL: PNG, HEIC (ftyp box), and short buffers are not', () => {
    expect(heic.isJpegMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(heic.isJpegMagic(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBe(false);
    expect(heic.isJpegMagic(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
  it('reads dimensions from SOF (so a shrink would be visible in the report)', () => {
    expect(heic.jpegDimensions(jpegBytes(3000, 4000))).toEqual({ width: 3000, height: 4000 });
    expect(heic.jpegDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe('S112 undo record', () => {
  const row = { id: 'r1', file_path: OLD, file_name: 'IMG_0042.HEIC', mime_type: 'image/heic', file_size: 1234, markup_data: M };
  const plan = heic.planRow(row, [OLD, thumbPathFor(OLD, M), derivativePathFor(OLD)]);

  it('carries everything undo needs: old four columns, new path, copied objects, markup fingerprint', () => {
    const r = heic.undoRecord('done', row, plan);
    expect(r).toMatchObject({
      event: 'done',
      id: 'r1',
      old_path: OLD,
      old_mime: 'image/heic',
      old_name: 'IMG_0042.HEIC',
      old_size: 1234,
      new_path: NEW,
      markup_fp: heic.markupFingerprint(M),
    });
    expect([...r.copied_objects].sort()).toEqual([derivativePathFor(NEW), thumbPathFor(NEW, M)].sort());
    expect(() => heic.validateUndoRecord(JSON.parse(JSON.stringify(r)))).not.toThrow();
  });

  it('CONTROL: a record whose new_path does not derive from old_path, or missing a key, is rejected', () => {
    const r = heic.undoRecord('done', row, plan);
    expect(() => heic.validateUndoRecord({ ...r, new_path: 'co-uuid/elsewhere.jpg' })).toThrow(/derive/);
    const { old_mime: _dropped, ...missing } = r;
    expect(() => heic.validateUndoRecord(missing)).toThrow(/old_mime/);
  });

  it('latestByRow: pending then done → done (plan kept); pending alone stays pending (crash)', () => {
    const text = [heic.undoRecord('pending', row, plan), heic.undoRecord('done', row, plan, { new_size: 9 }),
      heic.undoRecord('pending', { ...row, id: 'r2' }, plan)].map((x) => JSON.stringify(x)).join('\n');
    const m = heic.latestByRow(text);
    expect(m.get('r1')).toMatchObject({ event: 'done', new_size: 9, copied_objects: expect.any(Array) });
    expect(m.get('r2')?.event).toBe('pending');
  });
});

function fakeDb() {
  const calls: string[] = [];
  const chain = {
    update: vi.fn(() => { calls.push('update'); return chain; }),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: { file_path: OLD }, error: null })),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'r1' }], error: null }).then(res),
  };
  const bucket = {
    upload: vi.fn(async () => { calls.push('upload'); return { error: null }; }),
    copy: vi.fn(async () => { calls.push('copy'); return { error: null }; }),
    remove: vi.fn(async () => { calls.push('remove'); return { error: null }; }),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://x/render' }, error: null })),
  };
  return { calls, chain, bucket, db: { from: vi.fn(() => chain), storage: { from: vi.fn(() => bucket) } } };
}

describe('S112 the write gate — dry run cannot write', () => {
  it('without --apply every write REFUSES and the storage/DB fakes are never reached', async () => {
    const f = fakeDb();
    const w = heic.makeWriter(f.db, false);
    await expect(w.upload(NEW, new Uint8Array([1]), 'image/jpeg')).rejects.toThrow(/REFUSING/);
    await expect(w.copy('a', 'b')).rejects.toThrow(/REFUSING/);
    await expect(w.remove(['a'])).rejects.toThrow(/REFUSING/);
    await expect(w.updateFile('r1', OLD, {})).rejects.toThrow(/REFUSING/);
    expect(() => w.openUndo('/nonexistent/x')).toThrow(/REFUSING/);
    expect(f.calls).toEqual([]);
  });

  it('CONTROL: with --apply the same calls DO reach the fakes', async () => {
    const f = fakeDb();
    const w = heic.makeWriter(f.db, true);
    await w.upload(NEW, new Uint8Array([1]), 'image/jpeg');
    await w.copy('a', 'b');
    await w.remove(['a']);
    await w.updateFile('r1', OLD, {});
    expect(f.calls).toEqual(['upload', 'copy', 'remove', 'update']);
  });
});

describe('S112 args', () => {
  it('--apply needs --undo-file; --project-ref is required; concurrency is capped at 2', () => {
    expect(() => heic.parseArgs(['--project-ref', 'abc', '--apply'])).toThrow(/undo-file/);
    expect(() => heic.parseArgs(['--apply', '--undo-file', 'u.jsonl'])).toThrow(/project-ref/);
    expect(heic.parseArgs(['--project-ref', 'abc', '--concurrency', '9']).concurrency).toBe(2);
    expect(() => heic.parseArgs(['--project-ref', 'abc', '--verify', 'u', '--apply'])).toThrow(/read-only/);
    // CONTROL: the default is a dry run, and a full apply line parses
    expect(heic.parseArgs(['--project-ref', 'abc']).apply).toBe(false);
    expect(heic.parseArgs(['--project-ref', 'abc', '--apply', '--undo-file', 'u.jsonl'])).toMatchObject({ apply: true, undoFile: 'u.jsonl' });
  });
});

describe('S112 site-visit freeze pre-check (files_z_site_visit_freeze blocks the UPDATE even for the service role)', () => {
  const frozen = new Map([['est1', '2026-05-01T00:00:00Z']]);
  it('a capture taken before the freeze is skipped', () => {
    expect(heic.isFrozenSiteVisitFile({ site_visit_capture: true, estimate_id: 'est1', created_at: '2026-04-01T00:00:00Z' }, frozen)).toBe(true);
  });
  it('CONTROL: after the freeze, not a capture, or an unfrozen estimate → not skipped', () => {
    expect(heic.isFrozenSiteVisitFile({ site_visit_capture: true, estimate_id: 'est1', created_at: '2026-06-01T00:00:00Z' }, frozen)).toBe(false);
    expect(heic.isFrozenSiteVisitFile({ site_visit_capture: false, estimate_id: 'est1', created_at: '2026-04-01T00:00:00Z' }, frozen)).toBe(false);
    expect(heic.isFrozenSiteVisitFile({ site_visit_capture: true, estimate_id: 'est2', created_at: '2026-04-01T00:00:00Z' }, frozen)).toBe(false);
  });
});

describe('S112 convertRow against fakes — order, magic check, rollback', () => {
  const row = { id: 'r1', file_path: OLD, file_name: 'IMG_0042.HEIC', mime_type: 'image/heic', file_size: 10, markup_data: M };
  const plan = heic.planRow(row, [OLD, thumbPathFor(OLD, M), derivativePathFor(OLD)]);
  let dir = '';
  const undoPath = () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 's112-'));
    return path.join(dir, 'undo.jsonl');
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });
  // [S112 Q3] The converter is ImageMagick now, not /render/image/ — which
  // measured to drop capture time and GPS. Injected here; the real one runs in
  // s112-heic-convert.live.ts. _Superseded:_ a stubbed fetch of the render URL.
  const ok = (bytes: Uint8Array) => async () => bytes;
  const fails = (message: string) => async () => {
    throw new Error(message);
  };

  it('JPEG conversion → upload, copy each side object, then UPDATE; undo file reads pending, done', async () => {
    const f = fakeDb();
    const p = undoPath();
    const fd = fs.openSync(p, 'a');
    const r = await heic.convertRow(f.db, heic.makeWriter(f.db, true), fd, row, plan, ok(jpegBytes(3000, 4000)));
    fs.closeSync(fd);
    expect(r.dims).toEqual({ width: 3000, height: 4000 });
    expect(f.calls).toEqual(['upload', 'copy', 'copy', 'update']);
    expect(f.chain.update).toHaveBeenCalledWith({ file_path: NEW, mime_type: 'image/jpeg', file_name: 'IMG_0042.jpg', file_size: jpegBytes(1, 1).length });
    const events = fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l).event);
    expect(events).toEqual(['pending', 'done']);
  });

  it('CONTROL: a LOSSY conversion (evidence dropped) fails the row BEFORE any write, recorded rolled_back', async () => {
    const f = fakeDb();
    const p = undoPath();
    const fd = fs.openSync(p, 'a');
    await expect(
      heic.convertRow(f.db, heic.makeWriter(f.db, true), fd, row, plan, fails('conversion is lossy — EXIF GPSLatitude lost'))
    ).rejects.toThrow(/lossy/);
    fs.closeSync(fd);
    expect(f.calls).toEqual([]);
    expect(fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l).event)).toEqual(['pending', 'rolled_back']);
  });

  it('CONTROL: a converter failure of any kind (e.g. not a JPEG) never reaches a write', async () => {
    const f = fakeDb();
    const fd = fs.openSync(undoPath(), 'a');
    await expect(
      heic.convertRow(f.db, heic.makeWriter(f.db, true), fd, row, plan, fails('converted bytes do not start FF D8 FF'))
    ).rejects.toThrow(/FF D8 FF/);
    fs.closeSync(fd);
    expect(f.calls).toEqual([]);
  });

  it('a failed copy removes what this row created and never UPDATEs the row', async () => {
    const f = fakeDb();
    f.bucket.copy.mockImplementationOnce(async () => ({ error: { message: 'boom' } }) as never);
    const fd = fs.openSync(undoPath(), 'a');
    await expect(heic.convertRow(f.db, heic.makeWriter(f.db, true), fd, row, plan, ok(jpegBytes(10, 10)))).rejects.toThrow(/boom/);
    fs.closeSync(fd);
    expect(f.calls).not.toContain('update');
    expect(f.bucket.remove).toHaveBeenCalledWith([NEW]);
  });
});

describe('S112 Q3 — conversionDefect: capture time and GPS are evidence and must survive', () => {
  const src = {
    w: 3024,
    h: 4032,
    evidence: {
      DateTimeOriginal: '2019:07:29 12:18:34',
      GPSLatitude: '26/1,27/1,2270/100',
      GPSLatitudeRef: 'N',
      GPSLongitude: '80/1,7/1,4590/100',
      GPSLongitudeRef: 'W',
    },
  };
  it('identical size and every evidence field → no defect', () => {
    expect(heic.conversionDefect(src, { ...src, evidence: { ...src.evidence } })).toBeNull();
  });
  it('CONTROL — what /render/image/ measured: resized AND no EXIF → a defect', () => {
    expect(heic.conversionDefect(src, { w: 3000, h: 4000, evidence: {} })).toMatch(/resized/);
    expect(heic.conversionDefect(src, { w: 3024, h: 4032, evidence: {} })).toMatch(/DateTimeOriginal lost/);
  });
  it('GPS alone dropped → a defect', () => {
    const { GPSLatitude: _lat, ...rest } = src.evidence;
    expect(heic.conversionDefect(src, { ...src, evidence: rest })).toMatch(/GPSLatitude lost/);
  });
  it('a source WITHOUT evidence converts fine (nothing to lose)', () => {
    expect(heic.conversionDefect({ w: 10, h: 10, evidence: {} }, { w: 10, h: 10, evidence: {} })).toBeNull();
  });
  it('the evidence field list names capture time and both GPS coordinates', () => {
    expect(heic.EVIDENCE_FIELDS).toEqual(expect.arrayContaining(['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude']));
  });
});
