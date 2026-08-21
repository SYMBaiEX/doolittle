[CmdletBinding()]
param(
  [switch]$Headless,
  [switch]$SkipWizard,
  [switch]$Desktop,
  [switch]$Check,
  [switch]$Yes,
  [switch]$PackageInstaller
)

$ErrorActionPreference = "Stop"
$NubVersion = "0.7.5"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RequiredNodeVersion = (Get-Content (Join-Path $Root ".node-version") -Raw).Trim()
$RequiredNodeMajor = [int]($RequiredNodeVersion.Split(".")[0])
$ToolRoot = Join-Path $env:LOCALAPPDATA "Doolittle\tooling"
$LocalBinDir = Join-Path $env:LOCALAPPDATA "Doolittle\bin"
$DoolittleLauncher = Join-Path $LocalBinDir "doolittle.cmd"
$ShortLauncher = Join-Path $LocalBinDir "dl.cmd"

function Write-Section([string]$Message) {
  Write-Host $Message -ForegroundColor DarkYellow
}

function Resolve-Nub {
  if (-not (Get-Command node -ErrorAction SilentlyContinue) -or
      -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw @"
The source installer needs Node.js $RequiredNodeMajor+ to install Nub.
Install Node.js, then rerun scripts/install.ps1.
The standalone Doolittle Desktop .exe does not require Node.js or Nub.
"@
  }

  $nodeVersion = ((& node --version) | Select-Object -First 1).Trim().TrimStart("v")
  $nodeMajorText = ($nodeVersion -split "\.")[0]
  $nodeMajor = 0
  if (-not [int]::TryParse($nodeMajorText, [ref]$nodeMajor) -or $nodeMajor -lt $RequiredNodeMajor) {
    throw "Doolittle requires Node.js $RequiredNodeMajor+ (the repository pins $RequiredNodeVersion); found $nodeVersion."
  }

  $existing = Get-Command nub -ErrorAction SilentlyContinue
  if ($existing) {
    $versionLine = (& $existing.Source --version 2>$null | Select-Object -First 1)
    if ($versionLine -and $versionLine.TrimStart("v") -eq $NubVersion) {
      return $existing.Source
    }
  }

  if ($Check) {
    throw "Doolittle requires Nub $NubVersion. Install it with: npm install -g @nubjs/nub@$NubVersion"
  }
  Write-Section "Installing Nub $NubVersion into $ToolRoot..."
  New-Item -ItemType Directory -Force -Path $ToolRoot | Out-Null
  & npm install --global --prefix $ToolRoot "@nubjs/nub@$NubVersion"
  if ($LASTEXITCODE -ne 0) {
    throw "Nub installation failed with exit code $LASTEXITCODE."
  }

  $installed = Join-Path $ToolRoot "nub.cmd"
  if (-not (Test-Path $installed -PathType Leaf)) {
    throw "Nub installed, but its launcher was not found at $installed."
  }
  return $installed
}

function Add-UserPath([string]$PathToAdd) {
  $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $entries = @($currentUserPath -split ";" | Where-Object { $_ })
  if ($entries -notcontains $PathToAdd) {
    $updated = (@($PathToAdd) + $entries) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $updated, "User")
  }
  if (($env:Path -split ";") -notcontains $PathToAdd) {
    $env:Path = "$PathToAdd;$env:Path"
  }
}

function Install-Launchers([string]$NubCommand) {
  New-Item -ItemType Directory -Force -Path $LocalBinDir | Out-Null
  $entrypoint = Join-Path $Root "packages\agent\src\index.ts"
  $launcherBody = @"
@echo off
"$NubCommand" "$entrypoint" %*
"@
  Set-Content -Path $DoolittleLauncher -Value $launcherBody -Encoding Ascii
  if (-not (Test-Path $ShortLauncher)) {
    Set-Content -Path $ShortLauncher -Value $launcherBody -Encoding Ascii
  }
  Add-UserPath $LocalBinDir
}

Write-Host "DOOLITTLE // WINDOWS INSTALLER" -ForegroundColor DarkYellow
Write-Host "Nub-powered source bootstrap and standalone desktop builder"
Set-Location $Root

$Nub = Resolve-Nub

if (-not $Check) {
  Write-Section "Installing workspace dependencies..."
  & $Nub install --frozen-lockfile --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    throw "Dependency installation failed with exit code $LASTEXITCODE."
  }

  Write-Section "Installing Electron's standalone desktop runtime..."
  & $Nub run desktop:runtime:install
  if ($LASTEXITCODE -ne 0) {
    throw "Electron runtime installation failed with exit code $LASTEXITCODE."
  }

  Install-Launchers $Nub
} else {
  Write-Host "Dry run: no dependencies, launchers, or PATH entries will be written."
  Write-Host "Would create: $DoolittleLauncher"
}

$BootstrapArgs = @()
if ($Headless) { $BootstrapArgs += "--headless" }
if ($SkipWizard) { $BootstrapArgs += "--skip-wizard" }
if ($Check) { $BootstrapArgs += "--check" }
if ($Yes) { $BootstrapArgs += "--yes" }

Write-Section "Beginning the awakening sequence..."
& $Nub "scripts/bootstrap.ts" @BootstrapArgs
if ($LASTEXITCODE -ne 0) {
  throw "Doolittle bootstrap failed with exit code $LASTEXITCODE."
}

if ($PackageInstaller -and -not $Check) {
  Write-Section "Building the standalone Windows installer..."
  & $Nub run desktop:package:win
  if ($LASTEXITCODE -ne 0) {
    throw "Windows installer build failed with exit code $LASTEXITCODE."
  }
}

if ($Check) {
  Write-Host "Install check complete." -ForegroundColor Green
  exit 0
}

Write-Host "Install complete." -ForegroundColor Green
Write-Host "Open a new terminal, then run:"
Write-Host "  doolittle"
Write-Host "  doolittle desktop"
Write-Host "  doolittle doctor"
if ($PackageInstaller) {
  Write-Host "Standalone installer artifacts are in apps\desktop\release."
}

if ($Desktop -and -not $Headless) {
  & $DoolittleLauncher desktop
  exit $LASTEXITCODE
}
