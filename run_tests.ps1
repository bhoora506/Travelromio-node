$ErrorActionPreference = "Stop"

Write-Host "Running prisma validate..."
npx prisma validate

Write-Host "Running prisma generate..."
npx prisma generate

Write-Host "Running db verification..."
npm run verify:db

Write-Host "Running repo tests..."
npm run test:repositories

Write-Host "Running laravel verify..."
npm run verify:laravel

Write-Host "Running endpoint tests..."
node scripts/test-auth.js
node scripts/test-endpoints-n3b.js
node scripts/test-endpoints-real.js
node scripts/test-endpoints-n3c.js
node scripts/test-endpoints-n3d.js
node scripts/test-endpoints-n3e.js
node scripts/test-endpoints-n3f.js
node scripts/test-endpoints-n3g.js
node scripts/test-endpoints-n3h.js
node scripts/test-endpoints-n3i.js
node scripts/test-endpoints-n3j.js
node scripts/test-endpoints-n3k.js

Write-Host "Running npm audit..."
npm audit
