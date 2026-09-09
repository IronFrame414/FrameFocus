import { describe, expect, it } from 'vitest';
import { projectInContext, resolveCaptureProjectId } from '@/app/m/capture-store';

// S105b item 7 (ASK-7.A, RULED [Josh]) — the capture project source precedence:
// URL path > ?project= > open clock segment > null. `projectInContext` resolves
// the first two (URL over query); `resolveCaptureProjectId` layers the clock in
// as the third, with null still meaning "prompt after the shot" (A-21).

const A = '11111111-1111-1111-1111-111111111111'; // URL path project
const B = '22222222-2222-2222-2222-222222222222'; // ?project= project
const C = '33333333-3333-3333-3333-333333333333'; // clocked-in project

describe('projectInContext — URL path beats ?project=', () => {
  it('takes the path project on a /m/p/{id} screen even when ?project= is also set', () => {
    expect(projectInContext(`/m/p/${A}`, new URLSearchParams(`project=${B}`))).toBe(A);
    expect(projectInContext(`/m/p/${A}/punch`, new URLSearchParams())).toBe(A);
  });

  it('falls to ?project= when there is no path project', () => {
    expect(projectInContext('/m/logs', new URLSearchParams(`project=${B}`))).toBe(B);
  });

  it('is null when neither is present, and rejects a malformed ?project=', () => {
    expect(projectInContext('/m/timeclock', new URLSearchParams())).toBeNull();
    expect(projectInContext('/m/logs', new URLSearchParams('project=not-a-uuid'))).toBeNull();
  });
});

describe('resolveCaptureProjectId — clock is the THIRD source, only when no context', () => {
  it('context (URL or query) wins over the clock', () => {
    expect(resolveCaptureProjectId(A, C)).toBe(A);
    expect(resolveCaptureProjectId(B, C)).toBe(B);
  });

  it('uses the clocked-in job when there is no context', () => {
    expect(resolveCaptureProjectId(null, C)).toBe(C);
  });

  it('is null (A-21 prompt) when there is no context and no open clock segment', () => {
    expect(resolveCaptureProjectId(null, null)).toBeNull();
  });

  it('the full chain: URL > ?project= > clock > null', () => {
    // URL present → URL, regardless of the rest
    expect(resolveCaptureProjectId(projectInContext(`/m/p/${A}`, new URLSearchParams(`project=${B}`)), C)).toBe(A);
    // no URL, query present → query, over the clock
    expect(resolveCaptureProjectId(projectInContext('/m/logs', new URLSearchParams(`project=${B}`)), C)).toBe(B);
    // no URL, no query, clocked in → clock
    expect(resolveCaptureProjectId(projectInContext('/m/timeclock', new URLSearchParams()), C)).toBe(C);
    // nothing → null
    expect(resolveCaptureProjectId(projectInContext('/m/timeclock', new URLSearchParams()), null)).toBeNull();
  });
});
