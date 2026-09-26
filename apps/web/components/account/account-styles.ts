// [S112 audit F17] The account forms are SHARED — /dashboard/account and
// /m/account render the same NameForm and PasswordForm, so what they write
// cannot diverge (PARITY). What differs is presentation only: on /m they looked
// like the desktop app dropped into a phone — grey-300 borders, brand-500
// buttons, 42px inputs and a 40px Save, under M6M §2's 44px floor.
//
// `compact` (the /m caller passes it, as NotificationList's does) switches the
// classes. The desktop strings below are the ones the forms used before,
// unchanged, so desktop renders exactly as it did.

export type AccountClasses = {
  /** Class names for a field label. Named `labelClass`, not `label`: the /m
   *  i18n guard (test/support/m-i18n-scan.ts LABEL_PROPS) reads a `label:`
   *  property as user-facing copy, and these are classes. */
  labelClass: string;
  input: string;
  error: string;
  success: string;
  button: string;
};

const DESKTOP: AccountClasses = {
  labelClass: 'block text-sm font-medium text-gray-700 mb-1',
  input:
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
  error: 'rounded-lg bg-red-50 p-3 text-sm text-red-700',
  success: 'rounded-lg bg-green-50 p-3 text-sm text-green-700',
  button:
    'rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50',
};

const MOBILE: AccountClasses = {
  labelClass: 'mb-[6px] block font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-navy',
  // 16px text: under 16 iOS zooms the page on focus (audit F2).
  input:
    'h-[48px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] text-[16px] text-m6m-navy focus:border-m6m-blue focus:outline-none',
  error:
    'rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger',
  success: 'rounded-[10px] bg-[#effaf3] px-[12px] py-[8px] text-[14px] text-[#1f7a45]',
  button:
    'flex h-[52px] w-full items-center justify-center rounded-[14px] bg-m6m-blue text-[16px] font-bold text-white disabled:opacity-40',
};

export function accountClasses(compact: boolean): AccountClasses {
  return compact ? MOBILE : DESKTOP;
}
