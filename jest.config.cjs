const path = require('path');
const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: path.resolve(__dirname) });

module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
});
