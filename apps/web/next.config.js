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
    ...(isDev && {
      serverActions: {
        allowedOrigins: ['localhost:3000', '*.app.github.dev'],
      },
    }),
  },
};
module.exports = nextConfig;
