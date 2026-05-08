// Use development mode only when NODE_ENV is explicitly 'development'.
// On Plesk/production hosts NODE_ENV is often unset — defaulting to dev mode
// would make the server look for built assets in '.next-dev' while the build
// (which always runs with NODE_ENV=production) wrote them to '.next'.
const isDev = process.env.NODE_ENV === 'development';

// ── Security Headers (F-03) ──────────────────────────────────────────────────
const securityHeaders = [
  // Verhindert Clickjacking
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Verhindert MIME-Type-Sniffing (nur in Produktion; in Next.js-Dev
  // wird _clientMiddlewareManifest.js als application/json ausgeliefert).
  ...(isDev ? [] : [{ key: 'X-Content-Type-Options', value: 'nosniff' }]),
  // Verhindert Referrer-Leakage bei cross-origin Navigation
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Aktiviert HTTPS-Enforcing (nur in Produktion sinnvoll, aber schadet nicht)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Deaktiviert DNS-Prefetch
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Verhindert Adobe-Flash und PDF-Cross-Site-Zugriffe
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  // Permissions Policy: deaktiviert nicht benötigte Browser-APIs
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Content-Security-Policy – moderat: erlaubt inline scripts für Next.js und CodeMirror
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js braucht eval
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "frame-src 'self'",
      "worker-src blob: 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

module.exports = {
  distDir: isDev ? '.next-dev' : '.next',
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  turbopack: {},
  async headers() {
    return [
      {
        // Sicherheits-Header für alle Routen
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  }
};
