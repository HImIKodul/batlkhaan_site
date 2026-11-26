<#
.SYNOPSIS
  QPay activation, Step 1: read-only inspection, a new backup, and a restore test into a NEW isolated database.
.DESCRIPTION
  Production database: every statement runs with default_transaction_read_only=on; pg_dump only reads.
  Writes made by this script: one new folder under -BackupRoot (access limited to Administrators and SYSTEM) and one NEW database named
  mmri_restoretest_<timestamp>. It deletes nothing, restarts nothing, and changes no setting, firewall rule or existing file.
  The database password is prompted (or taken from PGPASSWORD) and never printed. DATABASE_URL and secret values are never printed.
  The backup folder holds customer data and a copy of the service .env: keep it on the server or on encrypted storage.
  Run in an elevated PowerShell:
    powershell -ExecutionPolicy Bypass -File .\Step1-InspectBackupRestore.ps1 -BackendDir <live backend folder> -PgDatabase <db> -PgUser postgres `
      -BackupRoot D:\MMRI\step1 -ReleaseDir <extracted release package>
#>
param(
  [Parameter(Mandatory=$true)][string]$BackendDir,
  [Parameter(Mandatory=$true)][string]$PgDatabase,
  [Parameter(Mandatory=$true)][string]$BackupRoot,
  [string]$PgUser = "postgres", [string]$PgHost = "127.0.0.1", [int]$PgPort = 5432,
  [string]$PgBin = "C:\Program Files\PostgreSQL\16\bin", [string]$ReleaseDir = "", [string]$ReportStorageDir = ""
)
$ErrorActionPreference = "Stop"
$onWindows = ($env:OS -eq "Windows_NT")
$exe = ""; if ($onWindows) { $exe = ".exe" }
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$target = "mmri_restoretest_$stamp"
$out = New-Object System.Collections.Generic.List[string]
$results = New-Object System.Collections.Generic.List[string]
function W($t) { $out.Add([string]$t); Write-Host $t }
function Section($t) { W ""; W "=== $t ===" }
function Result($ok, $name, $detail) { $s = "FAIL"; if ($ok) { $s = "PASS" }; $results.Add("$s  $name  $detail"); W "$s  $name  $detail" }
function Tool($name) { $p = Join-Path $PgBin "$name$exe"; if (-not (Test-Path $p)) { throw "missing $p (set -PgBin)" }; return $p }
$ro = "-c default_transaction_read_only=on"
# SQL goes through standard input so that quoted column names survive Windows PowerShell argument passing.
function Sql($db, $query, [bool]$readOnly = $true) {
  if ($readOnly) { $env:PGOPTIONS = $ro } else { $env:PGOPTIONS = "" }
  $r = $query | & (Tool "psql") -X -q -At -F "|" -v ON_ERROR_STOP=1 -h $PgHost -p $PgPort -U $PgUser -d $db -f -
  $code = $LASTEXITCODE; $env:PGOPTIONS = ""
  if ($code -ne 0) { throw "query failed on database $db (psql exit $code)" }
  # Emits one object per row and nothing for no rows. Callers wrap in @() before indexing or counting (a single row would otherwise be a plain string).
  if ($null -ne $r) { $r }
}

if (-not (Test-Path (Join-Path $BackendDir ".env"))) { throw "no .env in -BackendDir; confirm the folder of the RUNNING backend" }
$envMap = @{}
Get-Content (Join-Path $BackendDir ".env") | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $envMap[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") } }
$full = [System.IO.Path]::GetFullPath($BackupRoot)
if ($full.StartsWith([System.IO.Path]::GetFullPath($BackendDir), [System.StringComparison]::OrdinalIgnoreCase)) { throw "-BackupRoot must be outside the application folder" }
$setPassword = $false
if (-not $env:PGPASSWORD) {
  $sec = Read-Host -AsSecureString "Password for PostgreSQL user $PgUser (not shown)"
  $env:PGPASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)); $setPassword = $true
}

$dest = Join-Path $full "step1-$stamp"
New-Item -ItemType Directory -Force $dest | Out-Null
if ($onWindows) { & icacls $dest /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null; if ($LASTEXITCODE -ne 0) { throw "could not restrict $dest" } }

try {
  Section "Source database identity"
  $url = $envMap["DATABASE_URL"]
  if (-not $url) { throw "DATABASE_URL is not in the backend .env: find how the service gets it before going on" }
  $u = [System.Uri]$url; $liveDb = [System.Uri]::UnescapeDataString($u.AbsolutePath.TrimStart('/'))
  W "Running application points to database '$liveDb' on host '$($u.Host)' port $($u.Port)"
  Result ($liveDb -ceq $PgDatabase) "source is the application database" "-PgDatabase=$PgDatabase"
  if ($liveDb -cne $PgDatabase) { throw "-PgDatabase differs from the database the application uses" }
  if (@("127.0.0.1","localhost","::1") -notcontains $u.Host) { W "NOTE: the application database host is not loopback. Confirm that -PgHost/-PgPort reach the SAME server." }

  Section "PostgreSQL storage and persistence (read-only)"
  Sql $PgDatabase "select 'server_version',current_setting('server_version') union all select 'data_directory',current_setting('data_directory') union all select 'fsync',current_setting('fsync') union all select 'full_page_writes',current_setting('full_page_writes') union all select 'wal_level',current_setting('wal_level') union all select 'archive_mode',current_setting('archive_mode') union all select 'listen_addresses',current_setting('listen_addresses') union all select 'ssl',current_setting('ssl');" | ForEach-Object { W $_ }
  $dur = @(Sql $PgDatabase "select current_setting('fsync')||','||current_setting('full_page_writes');")[0]
  Result ($dur -eq "on,on") "durable write settings" "fsync,full_page_writes=$dur"
  $size = [int64]@(Sql $PgDatabase "select pg_database_size(current_database());")[0]
  $drive = New-Object System.IO.DriveInfo ([System.IO.Path]::GetPathRoot($full))
  W ("database size MB: {0:N0}; free on backup drive MB: {1:N0}" -f ($size/1MB), ($drive.AvailableFreeSpace/1MB))
  if ($drive.AvailableFreeSpace -lt 3 * $size) { throw "less than 3x the database size is free: stop (check the PostgreSQL data drive too)" }

  Section "Billing settings (no secret values)"
  foreach ($k in "NODE_ENV","MMRI_ENVIRONMENT","MMRI_BILLING_PROVIDER","MMRI_BILLING_ENFORCEMENT","MMRI_DIAGNOSTIC_PRICE_MNT","MMRI_RETAKE_PRICE_MNT","MMRI_BILLING_CALLBACK_BASE_URL","QPAY_BASE_URL","MMRI_INVOICE_TTL_MINUTES","MMRI_REPORT_REVIEW_REQUIRED","TRUST_PROXY","TRUST_PROXY_HOPS") { W ("{0}={1}" -f $k, $envMap[$k]) }
  foreach ($k in "QPAY_CLIENT_ID","QPAY_CLIENT_SECRET","QPAY_INVOICE_CODE","MMRI_MANUAL_PAYMENT_QR_TEXT","MMRI_MANUAL_PAYMENT_QR_IMAGE","MMRI_MANUAL_PAYMENT_SHORT_URL","MMRI_OPERATOR_USER_IDS") { $s = "not set"; if ($envMap[$k]) { $s = "SET (value hidden)" }; W "$k : $s" }
  if ($onWindows) { W (".env access: " + (((Get-Acl (Join-Path $BackendDir ".env")).Access | ForEach-Object { "$($_.IdentityReference)=$($_.FileSystemRights)" }) -join '; ')) }

  Section "Invoices and entitlements (read-only; no names or e-mail)"
  W "provider|status|count"
  Sql $PgDatabase 'select provider::text,status::text,count(*) from billing_invoices group by 1,2 order by 1,2;' | ForEach-Object { W $_ }
  W "open MANUAL invoices: id|domain|plan|amountMnt|createdAt"
  $open = @(Sql $PgDatabase 'select id,"domainCode","planCode"::text,"amountMnt","createdAt" from billing_invoices where provider::text=''MANUAL'' and status::text in (''CREATED'',''PENDING'') order by "createdAt";')
  $open | ForEach-Object { W $_ }; W "open MANUAL invoice count: $($open.Count)"
  W "entitlements: origin|status|count"
  try { Sql $PgDatabase 'select origin::text,status::text,count(*) from company_entitlements group by 1,2 order by 1,2;' | ForEach-Object { W $_ } } catch { W "origin column absent (older schema)" }

  Section "Migrations (compared without running Prisma)"
  $applied = @{}
  Sql $PgDatabase "select migration_name,checksum,case when rolled_back_at is not null then 'rolled-back' when finished_at is null then 'unfinished' else 'applied' end from _prisma_migrations order by started_at;" | ForEach-Object { $p = $_.Split('|'); if ($p[2] -ne 'rolled-back') { $applied[$p[0]] = @($p[1], $p[2]) } }
  W "applied or unfinished rows: $($applied.Count)"
  $unfinished = @($applied.Keys | Where-Object { $applied[$_][1] -ne 'applied' }); Result ($unfinished.Count -eq 0) "no unfinished migration" ($unfinished -join ', ')
  if ($ReleaseDir) {
    $files = @(Get-ChildItem (Join-Path $ReleaseDir "backend/prisma/migrations") -Directory | Sort-Object Name)
    $pending = @($files | Where-Object { -not $applied.ContainsKey($_.Name) } | ForEach-Object { $_.Name })
    $unknown = @($applied.Keys | Where-Object { $files.Name -notcontains $_ })
    $changed = @($files | Where-Object { $applied.ContainsKey($_.Name) -and ((Get-FileHash (Join-Path $_.FullName "migration.sql") -Algorithm SHA256).Hash.ToLower() -ne $applied[$_.Name][0]) } | ForEach-Object { $_.Name })
    W "release migrations: $($files.Count); pending: $($pending.Count)"; $pending | ForEach-Object { W "  pending: $_" }
    Result ($unknown.Count -eq 0) "database has no migration the release lacks" ($unknown -join ', ')
    Result ($changed.Count -eq 0) "applied migration checksums match the release" ($changed -join ', ')
    Section "Deployed backend compared with the release (compiled files)"
    $rd = Join-Path $ReleaseDir "backend/dist"; $ld = Join-Path $BackendDir "dist"
    if ((Test-Path $ld) -and (Test-Path $rd)) {
      $same = 0; $diff = New-Object System.Collections.Generic.List[string]; $rdFull = (Resolve-Path $rd).Path
      Get-ChildItem $rdFull -Recurse -File -Filter *.js | ForEach-Object { $rel = $_.FullName.Substring($rdFull.Length + 1); $live = Join-Path $ld $rel; if ((Test-Path $live) -and ((Get-FileHash $live).Hash -eq (Get-FileHash $_.FullName).Hash)) { $same++ } else { $diff.Add($rel) } }
      W "identical: $same; different or missing: $($diff.Count)"; $diff | Select-Object -First 40 | ForEach-Object { W "  differs: $_" }
    } else { W "no compiled dist in the live backend folder (it may run from source): record how the service starts" }
  } else { W "pass -ReleaseDir to list pending migrations" }
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4000/health" -TimeoutSec 10; W "local /health: $($r.Content)" } catch { W "local /health not reachable on port 4000" }

  Section "New backup (nothing older is touched)"
  $countSql = "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1;"
  $before = @{}; Sql $PgDatabase $countSql | ForEach-Object { $p = $_.Split('|'); $before[$p[0]] = [int64]$p[1] }
  $dump = Join-Path $dest "$PgDatabase-$stamp.dump"
  $env:PGOPTIONS = $ro; & (Tool "pg_dump") -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase --format=custom --file $dump; $code = $LASTEXITCODE; $env:PGOPTIONS = ""
  if ($code -ne 0) { throw "pg_dump failed (exit $code): there is NO valid backup" }
  $after = @{}; Sql $PgDatabase $countSql | ForEach-Object { $p = $_.Split('|'); $after[$p[0]] = [int64]$p[1] }
  & (Tool "pg_restore") --list $dump | Out-Null; if ($LASTEXITCODE -ne 0) { throw "pg_restore cannot read the dump" }
  $hash = (Get-FileHash $dump -Algorithm SHA256).Hash.ToLower(); "$hash  $(Split-Path $dump -Leaf)" | Set-Content "$dump.sha256"
  Result $true "backup created and readable" ("{0:N1} MB sha256 {1}" -f ((Get-Item $dump).Length/1MB), $hash)

  Section "Restore test into a NEW isolated database"
  if ($target -ceq $PgDatabase -or $target -notmatch '^mmri_restoretest_\d{14}$') { throw "unsafe restore target" }
  $exists = @(Sql "postgres" "select count(*) from pg_database where datname='$target';")[0]
  if ($exists -ne "0") { throw "restore target already exists" }
  Sql "postgres" "create database $target template template0 encoding 'UTF8';" $false | Out-Null
  Sql "postgres" "revoke connect on database $target from public;" $false | Out-Null
  & (Tool "pg_restore") -h $PgHost -p $PgPort -U $PgUser -d $target --no-owner --no-acl --exit-on-error $dump
  if ($LASTEXITCODE -ne 0) { throw "restore FAILED (exit $LASTEXITCODE)" }
  $restored = @{}; Sql $target $countSql | ForEach-Object { $p = $_.Split('|'); $restored[$p[0]] = [int64]$p[1] }
  $bad = New-Object System.Collections.Generic.List[string]
  foreach ($t in $before.Keys) { $lo = [Math]::Min($before[$t], $after[$t]); $hi = [Math]::Max($before[$t], $after[$t]); if (-not $restored.ContainsKey($t) -or $restored[$t] -lt $lo -or $restored[$t] -gt $hi) { $bad.Add("$t source=$($before[$t])..$($after[$t]) restored=$($restored[$t])") } }
  Result (($bad.Count -eq 0) -and ($restored.Count -eq $before.Count)) "restored table and row counts match the source" "$($restored.Count)/$($before.Count) tables"
  $bad | ForEach-Object { W "  mismatch: $_" }
  foreach ($t in "users","companies","assessments","billing_invoices","company_entitlements","_prisma_migrations") { W "  $t restored=$($restored[$t])" }
  $invalid = @(Sql $target "select count(*) from pg_constraint where not convalidated;")[0]; Result ($invalid -eq "0") "restored constraints validated" "unvalidated=$invalid"

  Section "Report files and configuration copy"
  if (-not $ReportStorageDir) { $ReportStorageDir = $envMap["MMRI_REPORT_STORAGE_DIR"] }
  if ($ReportStorageDir -and (Test-Path $ReportStorageDir)) {
    $src = (Resolve-Path $ReportStorageDir).Path; $copy = Join-Path $dest "report-storage"; New-Item -ItemType Directory $copy | Out-Null
    $list = @(Get-ChildItem $src -Recurse -File); $wrong = 0
    foreach ($f in $list) { $to = Join-Path $copy $f.FullName.Substring($src.Length + 1); New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null; Copy-Item -LiteralPath $f.FullName -Destination $to; if ((Get-FileHash -LiteralPath $to).Hash -ne (Get-FileHash -LiteralPath $f.FullName).Hash) { $wrong++ } }
    Result ($wrong -eq 0) "report files copied and hash-checked" "$($list.Count) files, $wrong mismatches"
  } else { Result $false "report files copied" "report storage folder not found; set -ReportStorageDir" }
  $cfg = Join-Path $dest "config"; New-Item -ItemType Directory $cfg | Out-Null
  Copy-Item (Join-Path $BackendDir ".env") (Join-Path $cfg "backend.env.copy")
  if ($onWindows) {
    $apphost = "$env:SystemRoot\System32\inetsrv\config\applicationHost.config"; if (Test-Path $apphost) { Copy-Item $apphost $cfg }
    try { Import-Module WebAdministration; foreach ($site in Get-Website) { $wc = Join-Path ([Environment]::ExpandEnvironmentVariables($site.PhysicalPath)) "web.config"; if (Test-Path $wc) { Copy-Item $wc (Join-Path $cfg "web.config.$($site.Id)") } } } catch { W "IIS site configs not copied: $($_.Exception.Message)" }
  }
  W "configuration copied into the restricted backup folder"

  if ($onWindows) {
    Section "Remote administration and exposure (read-only; nothing is closed)"
    foreach ($port in 21,22,80,443,3389,4000,5432,5985,5986) {
      Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object { W "listening $($_.LocalAddress):$port $((Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName)" }
    }
    Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow -ErrorAction SilentlyContinue | ForEach-Object { $pf = $_ | Get-NetFirewallPortFilter; if ("$($pf.LocalPort)" -match '(^| )(21|3389|4000|5432|5985|5986)( |$)') { W "allow rule '$($_.DisplayName)' port=$($pf.LocalPort) profile=$($_.Profile) remote=$(($_ | Get-NetFirewallAddressFilter).RemoteAddress)" } }
    foreach ($n in "ftpsvc","WinRM","TermService","sshd") { $s = Get-Service $n -ErrorAction SilentlyContinue; if ($s) { W "service $n $($s.Status)" } }
    foreach ($p in "WSMan:\localhost\Service\AllowUnencrypted","WSMan:\localhost\Service\Auth\Basic") { try { W "$p = $((Get-Item $p).Value)" } catch { W "$p not readable" } }
    try { W ((& winrm enumerate winrm/config/listener) -join "`n") } catch { W "WinRM listeners not readable" }
  }
}
catch { Result $false "stopped" $_.Exception.Message }
finally {
  Section "Summary"
  $results | ForEach-Object { W $_ }
  W "backup folder: $dest"
  W "restore test database (holds customer data; drop it only after review): $target"
  W "  drop command, only if it was created: psql -h $PgHost -p $PgPort -U $PgUser -d postgres -c ""drop database $target"""
  $out | Set-Content -Path (Join-Path $dest "step1-report.txt") -Encoding UTF8
  if ($setPassword) { $env:PGPASSWORD = $null }
  $env:PGOPTIONS = ""
}
if (@($results | Where-Object { $_ -like "FAIL*" }).Count) { exit 1 }
