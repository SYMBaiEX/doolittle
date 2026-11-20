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
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PackageManager = (Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json).packageManager
if ($PackageManager -notmatch '^nub@(.+)$') {
  throw "package.json does not declare a Nub version."
}
$NubVersion = $Matches[1]
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
The portable Doolittle archive bundles its own Node runtime.
"@
  }

  $nodeVersion = ((& node --version) | Select-Object -First 1).Trim().TrimStart("v")
  $nodeMajorText = ($nodeVersion -split "\.")[0]
  $nodeMajor = 0
  if (-not [int]::TryParse($nodeMajorText, [ref]$nodeMajor) -or $nodeMajor -lt $RequiredNodeMajor) {
    throw "Doolittle requires Node.js $RequiredNodeMajor+ (the repository pins $RequiredNodeVersion); found $nodeVersion."
  }

  $installed = Join-Path $ToolRoot "nub.cmd"
  if (Test-Path $installed -PathType Leaf) {
    $versionLine = (& $installed --version 2>$null | Select-Object -First 1)
    if ($versionLine -and $versionLine.TrimStart("v") -eq $NubVersion) {
      return $installed
    }
  }

  $existing = Get-Command nub.cmd -CommandType Application -ErrorAction SilentlyContinue
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
  $entrypoint = Join-Path $Root "scripts\doolittle.ts"
  $nubDirectory = Split-Path -Parent $NubCommand
  $launcherBody = @"
@echo off
setlocal
set "PATH=$nubDirectory;%PATH%"
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

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "The source installer needs Cargo and Rust (see the minimum version in Cargo.toml)."
}
$Nub = Resolve-Nub
$env:Path = "$(Split-Path -Parent $Nub);$env:Path"

if (-not $Check) {
  Write-Section "Installing workspace dependencies..."
  & $Nub scripts/prepare-eliza-source.ts --install --frozen-lockfile --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    throw "Dependency installation failed with exit code $LASTEXITCODE."
  }

  Write-Section "Building the ElizaOS runtime and Rust CLI..."
  & $Nub run cli:build
  if ($LASTEXITCODE -ne 0) {
    throw "ElizaOS runtime build failed with exit code $LASTEXITCODE."
  }
  $CargoArgs = @("build", "--release", "--locked", "-p", "doolittle-cli-native")
  if ($Desktop -and -not $PackageInstaller) {
    $CargoArgs += @("-p", "doolittle-desktop")
  }
  & cargo @CargoArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Native client build failed with exit code $LASTEXITCODE."
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

if ($Check -and -not (Test-Path (Join-Path $Root "node_modules/@elizaos/core/package.json"))) {
  Write-Host "Workspace dependencies are missing. Setup checks are available after dependency installation."
} else {
  Write-Section "Checking local configuration..."
  & $Nub "scripts/bootstrap.ts" @BootstrapArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Doolittle bootstrap failed with exit code $LASTEXITCODE."
  }
}

if ($PackageInstaller -and -not $Check) {
  Write-Section "Packaging the native desktop and CLI..."
  & $Nub run desktop:package:win
  if ($LASTEXITCODE -ne 0) {
    throw "Native packaging failed with exit code $LASTEXITCODE."
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
