# OpenResearch installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/XiangJinyu/open-research/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo       = "XiangJinyu/open-research"
$BinaryName = "openresearch"
$InstallDir = if ($env:OPENRESEARCH_INSTALL_DIR) { $env:OPENRESEARCH_INSTALL_DIR } else { "$env:USERPROFILE\.openresearch\bin" }

function Info($msg)  { Write-Host $msg -ForegroundColor Cyan }
function Ok($msg)    { Write-Host $msg -ForegroundColor Green }
function Warn($msg)  { Write-Host $msg -ForegroundColor Yellow }
function Err($msg)   { Write-Host $msg -ForegroundColor Red; exit 1 }

Info "Detecting platform..."
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { Err "Only 64-bit Windows is supported" }
Ok "  Platform: windows-$arch"

Info "Fetching latest version..."
$releaseUrl = "https://api.github.com/repos/$Repo/releases/latest"
try {
    $release = Invoke-RestMethod -Uri $releaseUrl -UseBasicParsing
    $version = $release.tag_name
} catch {
    Err "Could not fetch latest version: $_"
}
Ok "  Version: $version"

$archiveName = "$BinaryName-windows-$arch.zip"
$downloadUrl = "https://github.com/$Repo/releases/download/$version/$archiveName"
Info "Downloading $downloadUrl..."

$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$archivePath = Join-Path $tmpDir $archiveName

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath -UseBasicParsing
} catch {
    Err "Download failed: $_"
}

Info "Extracting..."
$extractDir = Join-Path $tmpDir "extracted"
Expand-Archive -Path $archivePath -DestinationPath $extractDir -Force

$srcBin = $null
foreach ($name in @("openresearch.exe", "opencode.exe", "opencode")) {
    $candidate = Get-ChildItem -Path $extractDir -Recurse -Filter $name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) { $srcBin = $candidate.FullName; break }
}
if (-not $srcBin) { Err "Binary not found in archive" }

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
$destBin = Join-Path $InstallDir "$BinaryName.exe"
Copy-Item -Path $srcBin -Destination $destBin -Force
Ok "Installed to $destBin"

$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$currentPath", "User")
    Ok "Added $InstallDir to user PATH"
    Warn ""
    Warn "Restart your terminal for PATH changes to take effect."
    Warn "Or run now:  `$env:Path = `"$InstallDir;`$env:Path`""
} else {
    Info "PATH already configured."
}

Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

Write-Host ""
Ok "Done! Run '$BinaryName' to get started."
