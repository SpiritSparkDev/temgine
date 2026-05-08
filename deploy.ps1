Write-Host "🚀 Temgine CMS Deployment Script" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green
Write-Host ""
Write-Host "Strategy: build locally, prune devDeps, then upload everything." -ForegroundColor DarkCyan
Write-Host "No 'npm install' needed on the server." -ForegroundColor DarkCyan
Write-Host ""

# Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ Error: package.json not found. Run this script from the Temgine CMS root directory." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Building Next.js application (includes prisma generate)..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful" -ForegroundColor Green

Write-Host ""
Write-Host "✂️  Pruning devDependencies from node_modules..." -ForegroundColor Cyan
npm prune --omit=dev

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Prune failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Pruning done (devDependencies removed)" -ForegroundColor Green

Write-Host ""
Write-Host "📤 Upload everything to ~/httpdocs/ on the server via rsync/FTP:" -ForegroundColor Yellow
Write-Host "   .next/              (production build)"
Write-Host "   node_modules/       (pruned, no devDeps)"
Write-Host "   pages/, components/, lib/, public/, prisma/, scripts/"
Write-Host "   package.json, next.config.js, middleware.js, server.js"
Write-Host ""
Write-Host "💡 Recommended rsync command:" -ForegroundColor Cyan
Write-Host "   rsync -av --exclude=.git --exclude=.next-dev --exclude='node_modules/.cache' ./ <user>@<server>:~/httpdocs/"
Write-Host ""
Write-Host "2. Ensure .env file exists at ~/httpdocs/.env with:" -ForegroundColor White
Write-Host "   DATABASE_URL=postgresql://pf_admin:PASSWORD@localhost:5432/pf_database?schema=public"
Write-Host "   NEXTAUTH_URL=https://your-domain.example.com"
Write-Host "   NEXTAUTH_SECRET=<your-secret>"
Write-Host "   GITHUB_ID=<your-github-app-id>"
Write-Host "   GITHUB_SECRET=<your-github-app-secret>"
Write-Host "   DEV_MODE=false"
Write-Host ""
Write-Host "3. In Plesk UI:" -ForegroundColor White
Write-Host "   - Open Node.js > Node App Manager"
Write-Host "   - Find your app and click 'Restart'"
Write-Host ""
Write-Host "⚠️  After deployment, restore devDependencies locally with:" -ForegroundColor Yellow
Write-Host "   npm install"
Write-Host ""
Write-Host "✨ Deployment ready!" -ForegroundColor Green
