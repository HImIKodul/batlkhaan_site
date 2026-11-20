# NOT TESTED ON WINDOWS (authored on Linux). Review before running. Run in an elevated PowerShell on the server.
# Installs the API as a Windows service with NSSM (https://nssm.cc) running the COMPILED output (no tsx, no dev flags).
param([string]$Root = "C:\MMRI\current", [string]$Node = "C:\Program Files\nodejs\node.exe", [string]$Account = ".\svc-mmri", [string]$LogDir = "C:\MMRI\logs")
$ErrorActionPreference = "Stop"
if (-not (Test-Path "$Root\backend\dist\api\server.js")) { throw "compiled server not found: run npm ci && npm run build:prod in $Root\backend first" }
if (-not (Test-Path "$Root\backend\.env")) { throw "backend\.env missing (copy backend.env.production.example and fill it)" }
New-Item -ItemType Directory -Force $LogDir | Out-Null
nssm install MMRI-API $Node "dist\api\server.js"
nssm set MMRI-API AppDirectory "$Root\backend"
nssm set MMRI-API ObjectName $Account            # prompt/secure password handling is the operator's responsibility
nssm set MMRI-API Start SERVICE_AUTO_START
nssm set MMRI-API AppExit Default Restart
nssm set MMRI-API AppRestartDelay 5000
nssm set MMRI-API AppStopMethodConsole 30000     # lets the API drain in-flight requests (SIGINT/Ctrl+C)
nssm set MMRI-API AppStdout "$LogDir\api.out.log"
nssm set MMRI-API AppStderr "$LogDir\api.err.log"
nssm set MMRI-API AppRotateFiles 1
nssm set MMRI-API AppRotateOnline 1
nssm set MMRI-API AppRotateBytes 52428800
nssm set MMRI-API AppEnvironment "NODE_ENV=production" "NODE_OPTIONS=--max-old-space-size=3072"
sc.exe failure MMRI-API reset= 86400 actions= restart/5000/restart/15000/restart/60000
icacls "$Root\backend\.env" /inheritance:r /grant:r "Administrators:F" "${Account}:R"
Write-Host "Installed. Start with: nssm start MMRI-API ; verify: node ops\smoke-test.mjs (MMRI_BASE_URL=http://127.0.0.1:4000)"
