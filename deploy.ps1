Write-Host "🚀 TempHelix Deployment Script" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green
Write-Host ""

# Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ Error: package.json not found. Run this script from the TempHelix root directory." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Building Next.js application..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build successful" -ForegroundColor Green
Write-Host ""
Write-Host "📤 Next steps to deploy to Plesk:" -ForegroundColor Yellow
Write-Host "1. Upload files to Plesk via FTP or SFTP:" -ForegroundColor White
Write-Host "   - .next folder"
Write-Host "   - pages folder"
Write-Host "   - components folder"
Write-Host "   - lib folder"
Write-Host "   - public folder"
Write-Host "   - prisma folder"
Write-Host "   - package.json"
Write-Host "   - next.config.js"
Write-Host "   - middleware.js"
Write-Host "   - server.js"
Write-Host ""
Write-Host "2. Ensure .env file exists at ~/httpdocs/.env with:" -ForegroundColor White
Write-Host "   DATABASE_URL=postgresql://pf_admin:PASSWORD@localhost:5432/pf_database?schema=public"
Write-Host "   NEXTAUTH_URL=https://reverent-grothendieck.212-227-188-40.plesk.page"
Write-Host "   NEXTAUTH_SECRET=<your-secret>"
Write-Host "   GITHUB_ID=<your-github-app-id>"
Write-Host "   GITHUB_SECRET=<your-github-app-secret>"
Write-Host "   DEV_MODE=false"
Write-Host ""
Write-Host "3. In Plesk UI:" -ForegroundColor White
Write-Host "   - Open Node.js > Node App Manager"
Write-Host "   - Find your app and click 'Restart'"
Write-Host ""
Write-Host "💡 Or use PowerShell to upload (requires SSH key):" -ForegroundColor Cyan
Write-Host "   scp -r .next <user>@reverent-grothendieck.212-227-188-40.plesk.page:~/httpdocs/"
Write-Host ""
Write-Host "✨ Deployment ready!" -ForegroundColor Green
