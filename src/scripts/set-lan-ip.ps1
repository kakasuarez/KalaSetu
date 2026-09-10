<#
.SYNOPSIS
    Point the mobile app and the API's media URLs at this machine's current LAN IP.

.DESCRIPTION
    The LAN IP moves with the DHCP lease, and two files have to agree on it:

      apps/mobile/.env   EXPO_PUBLIC_API_URL        where the phone sends requests
      .env               LOCAL_STORAGE_PUBLIC_BASE  the host baked into media URLs

    The address is read from the interface that actually has a default gateway.
    Picking by name, or taking the first address Node reports, selects Docker's
    "vEthernet (WSL)" adapter instead -- an address that exists only inside this
    PC and that the phone cannot route to.

.PARAMETER Start
    After updating the files, launch Expo with REACT_NATIVE_PACKAGER_HOSTNAME set,
    so the QR code advertises this IP rather than the WSL adapter's.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/set-lan-ip.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/set-lan-ip.ps1 -Start
#>
[CmdletBinding()]
param(
    [switch]$Start
)

$ErrorActionPreference = 'Stop'

$ip = (Get-NetIPConfiguration |
        Where-Object { $_.IPv4DefaultGateway }).IPv4Address.IPAddress |
      Select-Object -First 1

if (-not $ip) {
    Write-Error "No interface has a default gateway -- not connected to a network?"
    exit 1
}

$repo = Split-Path $PSScriptRoot -Parent
$base = "http://${ip}:8000"

function Set-EnvValue {
    param([string]$Path, [string]$Key, [string]$Value)

    if (-not (Test-Path $Path)) {
        Write-Error "Missing $Path"
        exit 1
    }

    # Substitute in the raw text rather than rewriting from a parsed map: these
    # files carry comments and a deliberate ordering that should survive.
    $text = [System.IO.File]::ReadAllText($Path)
    $line = "$Key=$Value"
    $pattern = "(?m)^[ \t]*" + [regex]::Escape($Key) + "[ \t]*=.*$"

    if ($text -match $pattern) {
        $text = [regex]::Replace($text, $pattern, $line)
    } else {
        if ($text -and -not $text.EndsWith("`n")) { $text += "`n" }
        $text += "$line`n"
    }

    # Not Set-Content -Encoding utf8: on Windows PowerShell 5.1 that writes a BOM,
    # which becomes part of the first key's name and silently breaks the file.
    [System.IO.File]::WriteAllText($Path, $text, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  $line"
}

Write-Host "LAN IP: $ip"
Set-EnvValue -Path (Join-Path $repo 'apps/mobile/.env') -Key 'EXPO_PUBLIC_API_URL'       -Value $base
Set-EnvValue -Path (Join-Path $repo '.env')             -Key 'LOCAL_STORAGE_PUBLIC_BASE' -Value $base

Write-Host ""
Write-Host "Next: docker compose up -d   (the root .env is read when the container is created,"
Write-Host "                              so 'restart' will not pick this up)"

if ($Start) {
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $ip
    Write-Host "Starting Expo with REACT_NATIVE_PACKAGER_HOSTNAME=$ip"
    Push-Location (Join-Path $repo 'apps/mobile')
    try { npx expo start -c } finally { Pop-Location }
} else {
    Write-Host "Then, to make the QR advertise $ip :"
    Write-Host "  `$env:REACT_NATIVE_PACKAGER_HOSTNAME = '$ip'; cd apps/mobile; npx expo start -c"
    Write-Host "  (or re-run this script with -Start)"
}
