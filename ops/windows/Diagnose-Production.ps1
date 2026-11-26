<#
.SYNOPSIS
  READ-ONLY diagnostic for the BusinessMRI production Windows server. Changes nothing: no restarts, no config or database writes.
.DESCRIPTION
  Run in an elevated PowerShell on the server:  powershell -ExecutionPolicy Bypass -File .\Diagnose-Production.ps1 -OutFile C:\Temp\mmri-diagnosis.txt
  Output contains NO secrets: only whitelisted setting names/values, aggregate counts, versions, ports and service names.
  Passwords, tokens, secrets, DATABASE_URL credentials and cookies are never printed. Review the file before sharing it.
.PARAMETER BackendDir  Directory containing the backend .env (auto-detected from the node process when omitted).
.PARAMETER Psql        Full path to psql.exe (optional). Without it the database section is skipped.
.PARAMETER PgUrl       Connection string for read-only counts; prefer an environment variable PGPASSWORD set only for this session.
#>
param([string]$OutFile = "$env:TEMP\mmri-diagnosis.txt", [string]$BackendDir = "", [string]$Psql = "", [string]$PgHost = "127.0.0.1", [int]$PgPort = 5432, [string]$PgDatabase = "", [string]$PgUser = "")
$ErrorActionPreference = 'Continue'
$out = New-Object System.Collections.Generic.List[string]
function W($t) { $out.Add([string]$t) }
function Section($t) { W ""; W ("=== " + $t + " ===") }

Section "Host"
$os = Get-CimInstance Win32_OperatingSystem
W "Computer: $env:COMPUTERNAME  OS: $($os.Caption) build $($os.BuildNumber)  Installed: $($os.InstallDate)  LastBoot: $($os.LastBootUpTime)"
W "Server time: $(Get-Date -Format o)  TimeZone: $((Get-TimeZone).Id)"
W "CPU: $((Get-CimInstance Win32_Processor | Select-Object -First 1).Name)  RAM GB: $([math]::Round($os.TotalVisibleMemorySize/1MB,1))  FreeRAM GB: $([math]::Round($os.FreePhysicalMemory/1MB,1))"
Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | ForEach-Object { W "Disk $($_.Name): used $([math]::Round($_.Used/1GB,1)) GB free $([math]::Round($_.Free/1GB,1)) GB" }

Section "Windows activation / evaluation (Standard Evaluation must not be the long-term production licence)"
try { Get-CimInstance SoftwareLicensingProduct | Where-Object { $_.PartialProductKey -and $_.Name -like 'Windows*' } | ForEach-Object { W "License: $($_.Name) status=$($_.LicenseStatus) (1=Licensed) graceMinutes=$($_.GracePeriodRemaining)" } } catch { W "license query failed: $($_.Exception.Message)" }
try { W ("slmgr: " + ((cscript //nologo "$env:SystemRoot\System32\slmgr.vbs" /xpr) -join ' ')) } catch {}
try { W ("Latest hotfixes: " + ((Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 5 | ForEach-Object { "$($_.HotFixID)($($_.InstalledOn.ToString('yyyy-MM-dd')))" }) -join ', ')) } catch {}

Section "Listening ports (who is exposed)"
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Sort-Object LocalPort | ForEach-Object {
  $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
  W ("{0,-18}:{1,-6} {2}" -f $_.LocalAddress, $_.LocalPort, $p.ProcessName) }
W "(Expect: 80/443 by IIS only; Node API and PostgreSQL on 127.0.0.1 ONLY. 3389/RDP, 5432, 4000 on 0.0.0.0 = exposure to fix.)"

Section "Firewall profiles and inbound allow rules on key ports"
Get-NetFirewallProfile | ForEach-Object { W "Profile $($_.Name): enabled=$($_.Enabled)" }
Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow -ErrorAction SilentlyContinue | ForEach-Object {
  $pf = $_ | Get-NetFirewallPortFilter; $af = $_ | Get-NetFirewallAddressFilter
  if ($pf.LocalPort -match '^(80|443|3389|5432|4000|4010|5173|5176)$') { W ("Rule '{0}' port={1} remote={2}" -f $_.DisplayName, $pf.LocalPort, $af.RemoteAddress) } }
try { $rdp = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server').fDenyTSConnections; W "RDP enabled: $($rdp -eq 0)" } catch {}

Section "IIS / ARR (reverse proxy) - sites, bindings, rewrite rules"
try {
  Import-Module WebAdministration -ErrorAction Stop
  Get-Website | ForEach-Object { W "Site $($_.Name) state=$($_.State) path=$($_.PhysicalPath) bindings=$(($_.Bindings.Collection | ForEach-Object { $_.protocol + ':' + $_.bindingInformation }) -join '; ')" }
  $arr = Get-WebConfiguration -Filter '/system.webServer/proxy' -PSPath 'MACHINE/WEBROOT/APPHOST' -ErrorAction SilentlyContinue
  if ($arr) { W "ARR proxy enabled=$($arr.enabled) preserveHostHeader=$($arr.preserveHostHeader) reverseRewriteHostInResponseHeaders=$($arr.reverseRewriteHostInResponseHeaders)" }
  foreach ($s in (Get-Website)) {
    $cfg = Join-Path $s.PhysicalPath 'web.config'
    if (Test-Path $cfg) { W "--- $cfg (rewrite rules only)"; try { [xml]$x = Get-Content $cfg -Raw; $x.SelectNodes('//rewrite//rule') | ForEach-Object { W ("rule {0}: match={1} action={2} url={3}" -f $_.name, $_.match.url, $_.action.type, $_.action.url) } } catch { W "web.config parse failed" } }
  }
  W "Server variables allowed (X-Forwarded-For must be preserved/appended by the proxy):"
  try { (Get-WebConfiguration -Filter '/system.webServer/rewrite/allowedServerVariables/add' -PSPath 'MACHINE/WEBROOT/APPHOST') | ForEach-Object { W "  allowed: $($_.name)" } } catch {}
  W "WebDAV module installed (blocks PUT/DELETE if not removed): $((Get-WebGlobalModule -Name WebDAVModule -ErrorAction SilentlyContinue) -ne $null)"
} catch { W "IIS module not available: $($_.Exception.Message)" }
foreach ($c in (Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like '*businessmri*' })) { W "Certificate $($c.Subject) expires $($c.NotAfter.ToString('yyyy-MM-dd')) thumbprint $($c.Thumbprint.Substring(0,8))..." }

Section "Application processes and services"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ForEach-Object { W "node pid=$($_.ProcessId) started=$($_.CreationDate) cmd=$($_.CommandLine -replace '(?i)(password|secret|token|key)=\S+','$1=***')" }
Get-CimInstance Win32_Service | Where-Object { $_.PathName -match 'node|nssm|pm2|postgres|mmri' -or $_.Name -match 'mmri|postgres|pm2' } | ForEach-Object { W "Service $($_.Name) state=$($_.State) start=$($_.StartMode) account=$($_.StartName) path=$($_.PathName -replace '(?i)(password|secret|token|key)=\S+','$1=***')" }
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'mmri|backup|pg_dump' } | ForEach-Object { W "Task $($_.TaskName) state=$($_.State) lastRun=$((Get-ScheduledTaskInfo $_).LastRunTime) lastResult=$((Get-ScheduledTaskInfo $_).LastTaskResult)" }

Section "Backend configuration (whitelisted, non-secret keys only)"
if (-not $BackendDir) {
  $n = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object -First 1
  if ($n -and $n.CommandLine -match '([A-Za-z]:\\[^"]*?)\\(dist|src)\\') { $BackendDir = $Matches[1] }
}
W "Backend dir: $BackendDir"
$allow = 'NODE_ENV','MMRI_ENVIRONMENT','PORT','ALLOWED_ORIGINS','COOKIE_SECURE','REFRESH_COOKIE_NAME','TRUST_PROXY','TRUST_PROXY_HOPS','API_RATE_LIMIT','AUTH_IP_RATE_LIMIT','AUTH_ACCOUNT_RATE_LIMIT','RATE_LIMIT_WINDOW_MS','MMRI_API_REPLICA_COUNT','MMRI_BILLING_PROVIDER','MMRI_BILLING_ENFORCEMENT','MMRI_DIAGNOSTIC_PRICE_MNT','MMRI_RETAKE_PRICE_MNT','MMRI_TARGET_METHODOLOGY_VERSION','MMRI_RELEASE_SHA','MMRI_AI_REPORT_PROVIDER'
if ($BackendDir -and (Test-Path "$BackendDir\.env")) {
  Get-Content "$BackendDir\.env" | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$' -and $allow -contains $Matches[1]) { W ("{0}={1}" -f $Matches[1], ($Matches[2].Trim('"'))) } }
  $te = (Get-Content "$BackendDir\.env" | Where-Object { $_ -match '^\s*TRUST_PROXY\s*=' })
  if (-not $te -or $te -notmatch 'true') { W "FINDING: TRUST_PROXY is not 'true'. Behind IIS/ARR every visitor shares ONE rate-limit bucket (20 logins/registrations per minute for the whole site)." }
  if (Test-Path "$BackendDir\.env") { W (".env ACL: " + (((Get-Acl "$BackendDir\.env").Access | ForEach-Object { "$($_.IdentityReference):$($_.FileSystemRights)" }) -join '; ')) }
} else { W ".env not found; process environment cannot be read without admin tooling. Check the service's environment variables manually (names only)." }
if ($BackendDir -and (Test-Path "$BackendDir\package.json")) { W ("backend package.json version: " + ((Get-Content "$BackendDir\package.json" -Raw | ConvertFrom-Json).version)) }
foreach ($u in 'http://127.0.0.1:4000/health','http://127.0.0.1:4000/ready') { try { $r = Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 10; W "GET $u -> $($r.StatusCode) $($r.Content.Substring(0,[Math]::Min(200,$r.Content.Length)))  x-mmri-release=$($r.Headers['x-mmri-release'])" } catch { W "GET $u failed: $($_.Exception.Message)" } }

Section "Frontend build identity (what IIS actually serves)"
foreach ($s in (Get-Website -ErrorAction SilentlyContinue)) {
  $idx = Join-Path $s.PhysicalPath 'index.html'
  if (Test-Path $idx) { $h = (Get-FileHash $idx -Algorithm SHA256).Hash.Substring(0,16); W "Site $($s.Name): index.html modified $((Get-Item $idx).LastWriteTime) sha256:$h"; W ("  asset refs: " + ((Select-String -Path $idx -Pattern 'assets/[^"]+' -AllMatches).Matches.Value -join ', ')) }
}

Section "PostgreSQL (read-only aggregate counts; no personal data printed)"
Get-CimInstance Win32_Service | Where-Object { $_.Name -match 'postgres' } | ForEach-Object { W "PG service $($_.Name) state=$($_.State)" }
$pgConf = Get-ChildItem "$env:ProgramFiles\PostgreSQL" -Recurse -Filter postgresql.conf -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgConf) { Select-String -Path $pgConf.FullName -Pattern '^\s*(listen_addresses|port|max_connections)\s*=' | ForEach-Object { W $_.Line.Trim() } }
if ($Psql -and $PgDatabase -and $PgUser -and (Test-Path $Psql)) {
  $q = @(
    "select 'users', count(*) from users",
    "select 'companies', count(*) from companies",
    "select 'test-like accounts (email domains example.test/mmri.test/qa/demo)', count(*) from users where email ~* '@(example\.test|mmri\.test|demo\.|qa\.)'",
    "select 'users created last 7 days', count(*) from users where \"createdAt\" > now() - interval '7 days'",
    "select 'migrations applied', count(*) from _prisma_migrations where finished_at is not null",
    "select 'latest migration', 1, migration_name from _prisma_migrations order by finished_at desc limit 1",
    "select 'methodology '||version, 1, status::text from methodology_versions where status='ACTIVE' order by version"
  )
  foreach ($s in $q) { $r = & $Psql -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase -At -F ' | ' -c $s 2>&1; W ($r -join '; ') }
  W "Database name: $PgDatabase (confirm it equals the DATABASE_URL database of the running backend; never print DATABASE_URL)"
} else { W "Database counts skipped (pass -Psql -PgDatabase -PgUser; export PGPASSWORD for this session only)." }

Section "Backups (existence and age only)"
Get-ChildItem -Path C:\,D:\ -Recurse -Include *.dump,*.backup,*.sql,*.sql.gz,*.zip -ErrorAction SilentlyContinue -Depth 3 | Where-Object { $_.Length -gt 1MB -and $_.FullName -match 'backup|mmri|pg' } | Sort-Object LastWriteTime -Descending | Select-Object -First 8 | ForEach-Object { W "$($_.FullName) $([math]::Round($_.Length/1MB,1)) MB $($_.LastWriteTime)" }

Section "Recent errors (counts only)"
try { $ev = Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddDays(-2)} -MaxEvents 200 -ErrorAction Stop; W "Application errors last 48h: $($ev.Count); top sources: $((($ev | Group-Object ProviderName | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ', '))" } catch { W "Event log query: $($_.Exception.Message)" }

$out | Set-Content -Path $OutFile -Encoding UTF8
Write-Host "Diagnosis written to $OutFile (read-only run; review before sharing)."
