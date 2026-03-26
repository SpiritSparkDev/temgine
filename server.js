// Lightweight Next.js custom server for Plesk/Passenger
// Starts the production build created via `npm run build`

// Load .env file if it exists (fallback for Plesk deployments)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed or .env doesn't exist, use process.env only
}

const { createServer } = require('http');
const { execSync } = require('child_process');
const path = require('path');
const next = require('next');

const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== 'production';

// Run database migrations on startup (Plesk: ENV vars are only available here, not in npm scripts)
if (process.env.DATABASE_URL) {
  try {
    console.log('> Running database migrations...');
    const prismaBin = path.join(__dirname, 'node_modules', '.bin', 'prisma');
    execSync(`"${prismaBin}" migrate deploy`, { stdio: 'inherit', env: process.env });
    console.log('> Migrations complete.');
  } catch (e) {
    console.error('> Migration failed:', e.message);
    // Don't exit — app may still work if schema is already up to date
  }
} else {
  console.warn('> WARNING: DATABASE_URL not set, skipping migrations.');
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on port ${port}`);
  });
});
