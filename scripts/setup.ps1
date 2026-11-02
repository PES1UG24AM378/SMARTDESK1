[CmdletBinding()]
param(
    [switch]$OfflineEmbedding
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Require-Command([string]$Name, [string]$InstallHint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $InstallHint"
    }
}

Require-Command 'node' 'Install Node.js 20.6+ (Node.js 22 LTS recommended), then reopen PowerShell.'
Require-Command 'npm' 'Install Node.js with npm, then reopen PowerShell.'
Require-Command 'docker' 'Install Docker Desktop, start it, then rerun this script.'

$nodeVersion = [version](node -p "process.versions.node")
if ($nodeVersion -lt [version]'20.6.0') {
    throw "Node.js 20.6+ is required; detected $nodeVersion. Install Node.js 22 LTS and reopen PowerShell."
}

if (-not (Test-Path '.env.local')) {
    Copy-Item '.env.example' '.env.local'
    Write-Host 'Created .env.local from .env.example.' -ForegroundColor Green
}

$envText = Get-Content '.env.local' -Raw
$generatedJwt = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$generatedCron = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
if ($envText -match '(?m)^JWT_SECRET=CHANGE_ME.*$') {
    $envText = [regex]::Replace($envText, '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$generatedJwt")
}
if ($envText -match '(?m)^CRON_SECRET=CHANGE_ME.*$') {
    $envText = [regex]::Replace($envText, '(?m)^CRON_SECRET=.*$', "CRON_SECRET=$generatedCron")
}
if ($OfflineEmbedding) {
    $envText = [regex]::Replace($envText, '(?m)^EMBEDDING_PROVIDER=.*$', 'EMBEDDING_PROVIDER=hash')
    Write-Host 'Offline embedding selected (lexical fallback; not the MiniLM semantic model).' -ForegroundColor Yellow
}
Set-Content -Path '.env.local' -Value $envText -Encoding utf8

Write-Host 'Installing locked npm dependencies...' -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Fix the npm error above and rerun this script.' }

Write-Host 'Starting local PostgreSQL + pgvector with Docker Compose...' -ForegroundColor Cyan
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose failed. Make sure Docker Desktop is running.' }

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    docker compose exec -T postgres pg_isready -U postgres -d smartdesk *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw 'PostgreSQL did not become ready within 60 seconds. Run: docker compose logs postgres' }

Write-Host ''
Write-Host 'WARNING: npm run db:reset drops and recreates the public schema in the database configured by ADMIN_DATABASE_URL.' -ForegroundColor Yellow
$confirmation = Read-Host 'Continue with database reset and loading synthetic demo data? Type YES to continue'
if ($confirmation -cne 'YES') {
    Write-Host 'Setup paused before database reset. Dependencies and PostgreSQL are ready. Review .env.local, then run npm run db:reset when ready.' -ForegroundColor Yellow
    exit 0
}

Write-Host 'Creating database schema and synthetic demo records...' -ForegroundColor Cyan
npm run db:reset
if ($LASTEXITCODE -ne 0) { throw 'Database reset failed. Check .env.local and PostgreSQL logs.' }

Write-Host 'Creating ticket embeddings (the MiniLM provider downloads model files on first run)...' -ForegroundColor Cyan
npm run embed
if ($LASTEXITCODE -ne 0) { throw 'Embedding generation failed. For an offline demo rerun with: .\scripts\setup.ps1 -OfflineEmbedding' }

Write-Host ''
Write-Host 'Setup complete. Start SmartDesk with: npm run dev' -ForegroundColor Green
Write-Host 'Then open http://localhost:3000' -ForegroundColor Green
Write-Host 'Gemini explanations are optional; configure GEMINI_API_KEY and GEMINI_MODEL in .env.local to enable real calls.' -ForegroundColor Gray
