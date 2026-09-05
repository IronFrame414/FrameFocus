import { SURFACE_COOKIE } from '@/lib/device';

// #101 — persist the surface choice, then HARD-navigate to that shell.
//
// A full navigation (window.location, not router.push) so the destination
// shell's server layout renders fresh under the new surface — /m and /dashboard
// are different layout trees, not two views of one. One year, path=/, SameSite
// Lax; see device.ts for why this cookie carries no security decision.
export function setSurfaceAndGo(surface: 'desktop' | 'mobile', target: string): void {
  document.cookie = `${SURFACE_COOKIE}=${surface}; path=/; max-age=31536000; samesite=lax`;
  window.location.assign(target);
}
