// S110 H — /m system text, area "shell". Keys are prefixed "shell.".
// `es` is typed against `en`'s keys: a key in one and not the other is a
// compile error. English text must stay BYTE-IDENTICAL to what the screen
// showed before (e2e specs assert it).

export const en = {} as const;

export const es: Record<keyof typeof en, string> = {};
