# NOT TESTED ON WINDOWS (authored on Linux; the same pg_dump logic is exercised by ops/backup-postgres.sh in the staging rehearsal).
# Nightly: custom-format dump, verified with pg_restore --list, SHA-256 sidecar, 14-day local retention, then copy OFF the machine.
param([string]$BackupDir = "D:\MMRI\backups", [string]$OffsiteDir = "", [int]$KeepDays = 14, [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin")
$ErrorActionPreference = "Stop"
if (-not $env:MMRI_BACKUP_DATABASE_URL) { throw "set MMRI_BACKUP_DATABASE_URL (a backup role, read-only) in the scheduled task's environment" }
New-Item -ItemType Directory -Force $BackupDir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ"); $out = Join-Path $BackupDir "mmri-$stamp.dump"
& "$PgBin\pg_dump.exe" --dbname=$env:MMRI_BACKUP_DATABASE_URL --format=custom --no-owner --no-acl --file "$out.tmp"
& "$PgBin\pg_restore.exe" --list "$out.tmp" | Out-Null
Move-Item "$out.tmp" $out
(Get-FileHash $out -Algorithm SHA256).Hash.ToLower() + "  " + (Split-Path $out -Leaf) | Set-Content "$out.sha256"
if ($OffsiteDir) { Copy-Item $out, "$out.sha256" $OffsiteDir; Write-Host "copied off-machine to $OffsiteDir" } else { Write-Warning "OffsiteDir not set: this backup shares the server's disk and does NOT protect against hardware failure" }
Get-ChildItem $BackupDir -Filter "mmri-*.dump*" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item
