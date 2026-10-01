// S122 ruling 9 — a weather day carries an icon the user SELECTS, and the icon
// RENDERS on the schedule as the visible reason the day was lost. One table,
// shared by every surface that draws one (the Critical Path tab, the Gantt,
// /m), so a "rain" day looks the same everywhere. The allowed keys are the
// database's CHECK (project_lost_days_icon_check).

export const WEATHER_ICONS = {
  rain: { glyph: '🌧️', label: 'Rain' },
  lightning: { glyph: '⚡', label: 'Lightning' },
  snow: { glyph: '❄️', label: 'Snow' },
  wind: { glyph: '💨', label: 'Wind' },
  heat: { glyph: '🔥', label: 'Heat' },
} as const;

export type WeatherIcon = keyof typeof WEATHER_ICONS;
export const WEATHER_ICON_KEYS = Object.keys(WEATHER_ICONS) as WeatherIcon[];

export function weatherGlyph(icon: string): string {
  return (WEATHER_ICONS as Record<string, { glyph: string }>)[icon]?.glyph ?? '•';
}
