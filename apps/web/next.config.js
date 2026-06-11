/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Only generate service worker in production; avoids noisy dev reloads
  disable: process.env.NODE_ENV === 'development',
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    // Cache API responses for offline graceful degradation
    {
      urlPattern: /^https?:\/\/.*\/api\/v1\/menu\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'menu-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 300 },
      },
    },
    {
      urlPattern: /^https?:\/\/.*\/static\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // Google fonts (if ever added)
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,

  // Allow images from the local API server and common CDN/S3 hosts
  images: {
    remotePatterns: [
      // Local API static files (local storage driver)
      { protocol: 'http', hostname: 'localhost', port: '4000', pathname: '/static/**' },
      // Production API static files — set NEXT_PUBLIC_API_HOST in .env to your domain
      ...(process.env.NEXT_PUBLIC_API_HOST
        ? [{ protocol: 'https', hostname: process.env.NEXT_PUBLIC_API_HOST, pathname: '/static/**' }]
        : []),
      // AWS S3
      { protocol: 'https', hostname: '*.s3.*.amazonaws.com', pathname: '/**' },
      { protocol: 'https', hostname: '*.s3.amazonaws.com', pathname: '/**' },
      // Cloudflare R2 / DigitalOcean Spaces / MinIO (custom domain)
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com', pathname: '/**' },
      { protocol: 'https', hostname: '**.digitaloceanspaces.com', pathname: '/**' },
      // Cloudinary CDN
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
    ],
  },

  // Forward /api/** to the NestJS API in dev — avoids CORS issues
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      // Proxy static uploads so images work regardless of whether the stored
      // URL uses an internal Docker hostname or a public domain.
      {
        source: '/static/:path*',
        destination: `${apiUrl}/static/:path*`,
      },
    ];
  },

  // Security headers
  async headers() {
    const apiUrl   = process.env.NEXT_PUBLIC_API_URL   || 'http://localhost:4000';
    const socketUrl= process.env.NEXT_PUBLIC_SOCKET_URL|| 'http://localhost:4000';

    // Build a tight CSP for production; relaxed in dev to support HMR.
    const isDev = process.env.NODE_ENV === 'development';

    const csp = [
      `default-src 'self'`,
      // Scripts: self + Next.js inline runtime (nonce-less build uses unsafe-inline in dev only)
      isDev ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://checkout.razorpay.com` : `script-src 'self' https://checkout.razorpay.com`,
      // Styles: self + inline (Tailwind generates inline styles)
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      // Fonts
      `font-src 'self' https://fonts.gstatic.com`,
      // Images: self + API static files + S3/CDN + Cloudinary
      `img-src 'self' data: blob: ${apiUrl} https://*.s3.amazonaws.com https://*.r2.cloudflarestorage.com https://*.digitaloceanspaces.com https://res.cloudinary.com`,
      // API + WebSocket connections — must include both ws: and wss: schemes
      `connect-src 'self' ${apiUrl} ${socketUrl} ws://${new URL(socketUrl).host} wss://${new URL(socketUrl).host} https://o1.ingest.sentry.io https://o2.ingest.sentry.io https://o4.ingest.sentry.io https://*.razorpay.com`,
      // Workers (service worker, next-pwa)
      `worker-src 'self' blob:`,
      // No plugins, no embed
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      // Prevent clickjacking
      `frame-ancestors 'none'`,
      `frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com`,
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy',   value: csp },
          { key: 'X-Frame-Options',            value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // Transpile shared package if present
  transpilePackages: ['@dinestay/shared'],

  // Output as standalone for Docker / self-hosted deployments
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
};

// withPWA wraps first, then withSentryConfig wraps the result.
// Sentry must be the outermost wrapper to inject its webpack plugin.
module.exports = withSentryConfig(
  withPWA(nextConfig),
  {
    // ── Sentry webpack plugin options ──────────────────────────────────────
    org:     process.env.SENTRY_ORG,      // your Sentry organisation slug
    project: process.env.SENTRY_PROJECT,  // your Sentry project slug

    // Only upload source maps in production CI (avoids leaking source in dev)
    silent: true,
    widenClientFileUpload: true,

    // Hides Sentry SDK from client bundle size (tree-shaken in dev)
    hideSourceMaps: true,

    // Disable logger spam during local development
    disableLogger: true,

    // Automatically instrument Next.js data-fetching methods
    automaticVercelMonitors: false,
  },
);
