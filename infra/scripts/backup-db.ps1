param(
  [string]$OutputDir = ".\\infra\\backups"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutputDir "gestion-$timestamp.sql"

$env:PGPASSWORD = ${env:POSTGRES_PASSWORD}

if (-not $env:POSTGRES_USER) { $env:POSTGRES_USER = "gestion" }
if (-not $env:POSTGRES_DB) { $env:POSTGRES_DB = "gestion" }
if (-not $env:POSTGRES_HOST) { $env:POSTGRES_HOST = "localhost" }
if (-not $env:POSTGRES_PORT) { $env:POSTGRES_PORT = "5432" }

& pg_dump.exe -h $env:POSTGRES_HOST -p $env:POSTGRES_PORT -U $env:POSTGRES_USER -d $env:POSTGRES_DB -f $file
Write-Output "Backup created: $file"
