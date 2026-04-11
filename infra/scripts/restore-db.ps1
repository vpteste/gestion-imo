param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$env:PGPASSWORD = ${env:POSTGRES_PASSWORD}

if (-not $env:POSTGRES_USER) { $env:POSTGRES_USER = "gestion" }
if (-not $env:POSTGRES_DB) { $env:POSTGRES_DB = "gestion" }
if (-not $env:POSTGRES_HOST) { $env:POSTGRES_HOST = "localhost" }
if (-not $env:POSTGRES_PORT) { $env:POSTGRES_PORT = "5432" }

& psql.exe -h $env:POSTGRES_HOST -p $env:POSTGRES_PORT -U $env:POSTGRES_USER -d $env:POSTGRES_DB -f $BackupFile
Write-Output "Restore completed from: $BackupFile"
