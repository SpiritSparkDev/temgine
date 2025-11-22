const path = require('path');

/**
 * Ensure a single instance of CodeMirror packages is resolved by webpack.
 * This avoids "Unrecognized extension value" errors caused by multiple
 * copies of `@codemirror/state` being loaded.
 */
module.exports = {
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
