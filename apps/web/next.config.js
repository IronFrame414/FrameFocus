/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@framefocus/shared', '@framefocus/supabase', '@framefocus/ui'],
};

module.exports = nextConfig;
