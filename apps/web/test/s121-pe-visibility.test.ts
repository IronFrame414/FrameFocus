import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { showPeControls } from '@/lib/estimates/pe-visibility';

// S121 Part 8 — PE controls show only when a live PE exists (or one is still
// assigned). PRESENTATION ONLY; the live test proves the "live" count.

const PE = { memberId: 'm-pe', name: 'Pat Exec' };

describe('showPeControls — both directions', () => {
  it('0 PEs, none assigned → HIDDEN', () => {
    expect(showPeControls({ executives: [], assignedMemberId: null })).toBe(false);
  });
  it('1 PE → SHOWN (the moment one exists, no setting)', () => {
    expect(showPeControls({ executives: [PE], assignedMemberId: null })).toBe(true);
  });
  it('0 live PEs but the estimate is still assigned → SHOWN (so it can be cleared)', () => {
    expect(showPeControls({ executives: [], assignedMemberId: 'm-gone' })).toBe(true);
  });
});

describe('it is labelled PRESENTATION ONLY, where the code is', () => {
  const src = readFileSync(fileURLToPath(new URL('../lib/estimates/pe-visibility.ts', import.meta.url)), 'utf8');
  it('says so, and names the #136 shape', () => {
    expect(src).toMatch(/PRESENTATION ONLY\. THIS IS NOT A SECURITY CONTROL\./);
    expect(src).toMatch(/#136/);
  });
});
