#!/bin/bash
# Deployment script for Temgine CMS to Plesk
# Run this on your local machine before uploading to server

echo "🚀 Temgine CMS Deployment Script"
echo "=============================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this script from the Temgine CMS root directory."
    exit 1
fi

echo "📦 Building Next.js application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""
echo "📤 Next steps to deploy to Plesk:"
echo "1. Copy the .next folder to your server at ~/httpdocs/.next"
echo "2. Copy node_modules to ~/httpdocs/node_modules"
echo "3. Ensure .env file exists at ~/httpdocs/.env with:"
echo "   - DATABASE_URL=postgresql://pf_admin:PASSWORD@localhost:5432/pf_database?schema=public"
echo "   - NEXTAUTH_URL=https://reverent-grothendieck.212-227-188-40.plesk.page"
echo "   - NEXTAUTH_SECRET=<your-secret>"
echo "   - GITHUB_ID=<your-github-app-id>"
echo "   - GITHUB_SECRET=<your-github-app-secret>"
echo "   - DEV_MODE=false"
echo ""
echo "4. In Plesk UI: Go to Node.js > Node App Manager > Restart the app"
echo ""
echo "💡 Alternative: Use FTP/SFTP to upload:"
echo "   scp -r .next <user>@<server>:~/httpdocs/"
echo "   scp package.json <user>@<server>:~/httpdocs/"
echo "   scp .env <user>@<server>:~/httpdocs/"
echo ""
echo "✨ Deployment ready!"
