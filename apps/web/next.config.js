/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  transpilePackages: ['@framefocus/shared', '@framefocus/supabase', '@framefocus/ui'],
  ...(isDev && {
    experimental: {
      serverActions: {
        allowedOrigins: ['localhost:3000', '*.app.github.dev'],
      },
    },
  }),
};
module.exports = nextConfig;
