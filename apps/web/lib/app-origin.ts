import type { NextRequest } from 'next/server';

/**
 * The origin this app is reached at FROM THE OUTSIDE — for building redirects.
 *
 * ⚠️ `new URL(path, request.url)` IS WRONG BEHIND ANY PROXY, AND IT FAILS IN A
 * WAY THAT LOOKS LIKE A ROUTING BUG [S190].
 *
 * Measured through the Codespaces tunnel, which is the same shape as any
 * reverse proxy (Vercel, a load balancer, ngrok):
 *
 *     host:              localhost:3000        <- what Next builds request.url from
 *     x-forwarded-host:  <name>-3000.app.github.dev
 *     x-forwarded-port:  443
 *     x-forwarded-proto: https
 *
 * Next takes the SCHEME from `x-forwarded-proto` but the HOST from the plain
 * `Host` header, so `request.url` came out as `https://localhost:3000/...`.
 * The proxy then rewrote `localhost` to the public host on the way out and
 * **left the `:3000` behind**, producing
 *
 *     https://<name>-3000.app.github.dev:3000/sign-in
 *
 * — a host that resolves to nothing. ⚠️ EVERY RECOVERABLE ERROR BECAME AN
 * UNREACHABLE PAGE: `?qb_error=state_mismatch` is a sentence the user is
 * supposed to read, and it was arriving as a dead link instead.
 *
 * ⚠️ THE CONFIGURED ORIGIN IS PREFERRED OVER THE HEADERS, and not only for
 * correctness. `Host` and `X-Forwarded-Host` are supplied by the caller, and a
 * redirect built from them is the classic host-header injection: an attacker
 * sends a forged host and we hand the victim a redirect to it. Trusting the
 * value we configured removes that entirely. The header path is the fallback
 * for when nothing is configured, and it is still better than `request.url`
 * because `x-forwarded-host` carries no port to double.
 *
 * `lib/quickbooks/config.ts`'s `qboRedirectUri()` already did it this way, which
 * is why the `redirect_uri` handed to Intuit was correct all along while the
 * redirects beside it were not — the same route, two constructions, one bug.
 */
export function appOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;

  // A comma-separated list is legal on both headers; the first entry is the
  // original client-facing value.
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ||
    request.nextUrl.protocol.replace(/:$/, '');
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    request.nextUrl.host;

  return `${proto}://${host}`;
}

/** An absolute URL for `path`, safe to hand to `NextResponse.redirect`. */
export function appUrl(path: string, request: NextRequest): URL {
  return new URL(path, appOrigin(request));
}
