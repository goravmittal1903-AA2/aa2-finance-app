import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  compress: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' http://144.24.99.155:8000 ws://144.24.99.155:8000 https://144.24.99.155.sslip.io wss://144.24.99.155.sslip.io https://*.supabase.co wss://*.supabase.co *; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/api/supabase-proxy/:path*',
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://144.24.99.155:8000'}/:path*`,
      },
    ]
  },
};

export default nextConfig;
