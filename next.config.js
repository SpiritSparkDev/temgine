const path = require('path');
// Use development mode only when NODE_ENV is explicitly 'development'.
// On Plesk/production hosts NODE_ENV is often unset — defaulting to dev mode
// would make the server look for built assets in '.next-dev' while the build
// (which always runs with NODE_ENV=production) wrote them to '.next'.
const isDev = process.env.NODE_ENV === 'development';

// ── Security Headers (F-03) ──────────────────────────────────────────────────
const securityHeaders = [
  // Verhindert Clickjacking
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Verhindert MIME-Type-Sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Verhindert Referrer-Leakage bei cross-origin Navigation
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Aktiviert HTTPS-Enforcing (nur in Produktion sinnvoll, aber schadet nicht)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Deaktiviert DNS-Prefetch
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Verhindert Adobe-Flash und PDF-Cross-Site-Zugriffe
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  // Permissions Policy: deaktiviert nicht benötigte Browser-APIs
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Content-Security-Policy – moderat: erlaubt inline scripts für Next.js und CodeMirror
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js + CodeMirror brauchen eval
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "frame-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

/**
 * Ensure a single instance of CodeMirror packages is resolved by webpack.
 * This avoids "Unrecognized extension value" errors caused by multiple
 * copies of `@codemirror/state` being loaded.
 */
module.exports = {
  distDir: isDev ? '.next-dev' : '.next',
  async headers() {
    return [
      {
        // Sicherheits-Header für alle Routen
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = config.resolve.alias || {};
    const pkgRoot = path.resolve(__dirname, 'node_modules');

    // Aliases for common CodeMirror packages to force a single resolved copy
    const aliases = [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@codemirror/commands',
      '@codemirror/autocomplete',
      '@codemirror/search',
      '@codemirror/lint',
      '@codemirror/theme-one-dark'
    ];

    aliases.forEach((name) => {
      config.resolve.alias[name] = path.join(pkgRoot, name);
    });

    return config;
  }
};
