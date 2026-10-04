// S128 Part H — H-2: COST CODES. docs/specs/cost-codes-masterformat-1995.md § 1 governs.
//
// A code is FIVE characters, `DDSSS`: two digits of division, three of section.
// ⚠️ STORED AS TEXT, ZERO-PADDED TO 5 — NEVER AS A NUMBER.
//
// The trap, from a real file: Excel stored Josh's competitor's codes as numbers, so every
// Division 01–09 code lost its leading zero. `01000` arrives as `1000`; read as a number and
// sliced, its first two characters are `10` and General Conditions files itself under
// Division 10 Specialties — silently.
//
// The padding rule is unambiguous (§ 1):
//   4 characters  → a Division 01–09 code that lost its zero → pad to 5
//   5 characters  → a Division 10–16 code, already whole     → leave it
//   anything else → not a MasterFormat 1995 section code      → REFUSE; do not guess

export type CostCodeResult = { ok: true; code: string } | { ok: false; error: string };

/**
 * Normalise a code received from a person or a spreadsheet. Accepts a string or a number
 * (an importer reading an Excel cell gets a number). Whitespace is trimmed; nothing else is
 * forgiven — no separators, no decimals, no guessing.
 */
export function normalizeCostCode(input: string | number | null | undefined): CostCodeResult {
  if (input == null) return { ok: false, error: 'A cost code is required.' };
  let raw: string;
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 0) {
      return { ok: false, error: `"${input}" is not a cost code: a code is 5 digits.` };
    }
    raw = String(input);
  } else {
    raw = input.trim();
  }
  if (!/^\d+$/.test(raw)) {
    return { ok: false, error: `"${raw}" is not a cost code: a code is 5 digits (e.g. 02110).` };
  }
  if (raw.length === 4) return { ok: true, code: `0${raw}` };
  if (raw.length === 5) return { ok: true, code: raw };
  return {
    ok: false,
    error: `"${raw}" is not a cost code: a code is 5 digits (4 is accepted for Divisions 01–09 that lost their leading zero).`,
  };
}

/** True for a stored code: exactly five digits, as text. */
export function isCostCode(code: unknown): code is string {
  return typeof code === 'string' && /^\d{5}$/.test(code);
}

/**
 * The division a code files under: its FIRST TWO CHARACTERS, read as text. Throws on anything
 * that is not a stored code — a number never reaches here, which is the point.
 */
export function costCodeDivision(code: string): string {
  if (!isCostCode(code)) {
    throw new Error(`costCodeDivision: "${String(code)}" is not a 5-digit text cost code`);
  }
  return code.slice(0, 2);
}
