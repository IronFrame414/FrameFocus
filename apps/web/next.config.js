/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  transpilePackages: ['@framefocus/shared', '@framefocus/supabase', '@framefocus/ui'],
  experimental: {
    // Next 14.2: outputFileTracingIncludes lives under `experimental` (it moved
    // to the top level in Next 15). co-template.tsx reads the Dancing Script TTF
    // off the filesystem via process.cwd() at render time, so Next's static
    // dependency trace can't see it and would omit it from the Vercel serverless
    // bundle. Force it in for the only two routes that render the CO PDF:
    //   /api/change-orders/[id]/send   → v1 (contractor-signed) at send
    //   /api/sign-co/[token]/complete  → v2 (fully signed) at client completion
    // Paths are relative to the app root (apps/web).
    outputFileTracingIncludes: {
      '/api/change-orders/[id]/send': ['./public/fonts/DancingScript-Variable.ttf'],
      '/api/sign-co/[token]/complete': ['./public/fonts/DancingScript-Variable.ttf'],
    },
    // [S112, RULED Josh] The client Router Cache must never hand back a page
    // the user has just changed. Next 14.2's default reuses a visited dynamic
    // page for 30s WITHOUT asking the server, so "mutate, then navigate back to
    // a page the client already holds" showed the pre-mutation page — found on
    // production as markup that vanished on save and on reopen (a save takes
    // ~6s, so the window is easily hit). 0 makes every push/Link navigation to a
    // dynamic page fetch. `static` keeps its 300s default (define-env-plugin
    // defaults each key independently).
    //
    // ⚠️ THIS DOES NOT COVER BACK/FORWARD. router.back(), the /m back arrow and
    // the phone's back gesture go through restore-reducer, which reuses the
    // in-memory cache and never reads staleTimes.
    //
    // ⚠️ ON HOLD [S112] — MEASURED MATERIALLY WORSE ON SLOW NETWORKS. A return
    // to a page visited <30s ago goes from ~50ms/0 bytes (served from memory)
    // to one RSC fetch of 4.6-8.0KB: median 639ms on Fast 3G, 2.1s on Slow 3G,
    // with no loading indicator on /m while it waits. Not shipped by ruling;
    // this branch exists so the measured change is not lost.
    staleTimes: { dynamic: 0 },
    ...(isDev && {
      serverActions: {
        allowedOrigins: ['localhost:3000', '*.app.github.dev'],
      },
    }),
  },
};
module.exports = nextConfig;
