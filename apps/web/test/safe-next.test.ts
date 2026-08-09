import { describe, it, expect } from 'vitest';
import { safeNextPath, DEFAULT_SIGNED_IN_PATH } from '@/lib/safe-next';

// `?next=` is a redirect target that arrives from a URL, so it is
// attacker-controlled. These cases are the difference between a fix and an
// open redirect on a correctly branded sign-in page.

describe('safeNextPath', () => {
  it('keeps /dashboard as the default so every existing caller is unchanged', () => {
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
    expect(DEFAULT_SIGNED_IN_PATH).toBe('/dashboard');
  });

  it('passes same-origin absolute paths through, query and all', () => {
    expect(safeNextPath('/m')).toBe('/m');
    expect(safeNextPath('/m/timeclock')).toBe('/m/timeclock');
    expect(safeNextPath('/m/logs?project=abc')).toBe('/m/logs?project=abc');
  });

  it('rejects an absolute URL', () => {
    expect(safeNextPath('https://evil.example/x')).toBe('/dashboard');
    expect(safeNextPath('http://evil.example')).toBe('/dashboard');
  });

  it('rejects the PROTOCOL-RELATIVE form, which a startsWith("/") check lets through', () => {
    // This is the case that is usually missed: it begins with '/', so it looks
    // like a path, and the browser resolves it to another ORIGIN.
    expect(safeNextPath('//evil.example/x')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.example/x')).toBe('/dashboard');
  });

  it('rejects a bare relative path, which would resolve against the current directory', () => {
    expect(safeNextPath('dashboard')).toBe('/dashboard');
    expect(safeNextPath('../admin')).toBe('/dashboard');
  });

  it('takes an explicit fallback for callers that do not default to the desktop', () => {
    expect(safeNextPath(null, '/m')).toBe('/m');
    expect(safeNextPath('//evil.example', '/m')).toBe('/m');
  });
});
