#!/bin/bash
# Deployment script for Temgine CMS to Plesk
# Run this on your LOCAL machine before uploading to server.
#
# Strategy: build locally, prune devDependencies, then upload everything.
# This avoids running "npm install" on the server and ensures the Prisma
# client (generated during build) is included correctly.

echo "🚀 Temgine CMS Deployment Script"
echo "=============================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this script from the Temgine CMS root directory."
    exit 1
fi

echo "📦 Building Next.js application (includes prisma generate)..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build successful"

echo ""
echo "✂️  Pruning devDependencies from node_modules..."
npm prune --omit=dev

if [ $? -ne 0 ]; then
    echo "❌ Prune failed"
    exit 1
fi
echo "✅ Pruning done (devDependencies removed)"

echo ""
echo "📤 Upload everything to ~/httpdocs/ on the server via rsync:"
echo ""
echo "   rsync -av --exclude=.git --exclude=.next-dev --exclude='node_modules/.cache' \\"
echo "     ./ <user>@<server>:~/httpdocs/"
echo ""
echo "   This uploads: .next/, node_modules/ (pruned), pages/, components/,"
echo "   lib/, public/, prisma/, scripts/, package.json, next.config.js, ..."
echo ""
echo "2. Ensure .env file exists at ~/httpdocs/.env with:"
echo "   DATABASE_URL=postgresql://pf_admin:PASSWORD@localhost:5432/pf_database?schema=public"
echo "   NEXTAUTH_URL=https://your-domain.example.com"
echo "   NEXTAUTH_SECRET=<your-secret>"
echo "   GITHUB_ID=<your-github-app-id>"
echo "   GITHUB_SECRET=<your-github-app-secret>"
echo "   DEV_MODE=false"
echo ""
echo "3. In Plesk UI: Go to Node.js > Node App Manager > Restart the app"
echo ""
echo "⚠️  After deployment, restore devDependencies locally with:"
echo "   npm install"
echo ""
echo "✨ Deployment ready!"
