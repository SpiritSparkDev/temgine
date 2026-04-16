const path = require('path');
// Use development mode only when NODE_ENV is explicitly 'development'.
// On Plesk/production hosts NODE_ENV is often unset — defaulting to dev mode
// would make the server look for built assets in '.next-dev' while the build
// (which always runs with NODE_ENV=production) wrote them to '.next'.
const isDev = process.env.NODE_ENV === 'development';

/**
 * Ensure a single instance of CodeMirror packages is resolved by webpack.
 * This avoids "Unrecognized extension value" errors caused by multiple
 * copies of `@codemirror/state` being loaded.
 */
module.exports = {
  distDir: isDev ? '.next-dev' : '.next',
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
