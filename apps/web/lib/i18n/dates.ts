import type { Lang } from '@/lib/i18n/lang';

// [S112 audit F4] The ONE locale for formatting dates and times on /m.
//
// Five /m formatters were hard-coded to 'en-US', so a Spanish reader saw
// "Sat, Sep 26", "Mon, Aug 3", "AUG 25" and "Aug 25, 2026, 9:06 PM" — on the
// Timeclock header, both schedules, the photo day labels and the viewer.
// `es-US`, not `es-ES`: these are US crews, so the calendar conventions stay
// American while the words are Spanish ("sáb, 26 sept").
//
// Timezone is NOT decided here — each caller keeps whatever zone it already
// passes (company tz, or UTC for the schedule's date-only values). This only
// picks the language the words come out in.
export function dateLocale(lang: Lang): 'en-US' | 'es-US' {
  return lang === 'es' ? 'es-US' : 'en-US';
}
