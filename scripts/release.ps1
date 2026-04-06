# ---------------------------------------------------------------------------
# better-uuid — Release script (PowerShell) — OPTIONAL
#
# Default release path is Node: `node scripts/release.mjs` (see package.json).
# Use this file only if you prefer PowerShell Core (`pwsh`) on Windows.
#
# Usage:
#   pnpm release:dry-run    # Gates + plan, no writes
#   pnpm release            # Interactive bump + summary, then full pipeline
#
# Environment variables:
#   $env:RELEASE_BUMP="patch|minor|major"
#   $env:RELEASE_SUMMARY="Fix thing X"
#   $env:RELEASE_STRICT_CLEAN="1"
# ---------------------------------------------------------------------------
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Resolve-Path (Join-Path $ScriptDir "..")
$PkgDir = Join-Path $RootDir "packages\better-uuid"
$PkgName = "better-uuid"

Set-Location $RootDir

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Log  { Write-Host "[release] $($args -join ' ')" -ForegroundColor Cyan }
function Warn { Write-Host "[release] $($args -join ' ')" -ForegroundColor Yellow }
function Err  { Write-Host "[release] $($args -join ' ')" -ForegroundColor Red }
function Die  { Err $args; exit 1 }

function Get-SemVer {
    param([string]$Bump, [string]$Ver)
    $parts = $Ver -split '[.\-]'
    $major = [int]($parts[0] -replace '[^\d]','')
    $minor = [int]($parts[1] -replace '[^\d]','')
    $patch = [int]($parts[2] -replace '[^\d]','')
    switch ($Bump) {
        "patch" { $patch++ }
        "minor" { $minor++; $patch = 0 }
        "major" { $major++; $minor = 0; $patch = 0 }
    }
    return "$major.$minor.$patch"
}

$CurrentVersion = (Get-Content (Join-Path $PkgDir "package.json") | ConvertFrom-Json).version

# ---------------------------------------------------------------------------
# Dry-run mode
# ---------------------------------------------------------------------------
if ($args.Count -gt 0 -and $args[0] -eq "--dry-run" -or $env:DRY_RUN -eq "1") {
    Log "═══ DRY RUN — no files will be modified ═══"
    Log ""
    Log "Current version: $CurrentVersion"
    Log ""
    Log "Available bumps:"
    Log "  patch  → $(Get-SemVer patch $CurrentVersion)"
    Log "  minor  → $(Get-SemVer minor $CurrentVersion)"
    Log "  major  → $(Get-SemVer major $CurrentVersion)"
    Log ""

    $Branch = git rev-parse --abbrev-ref HEAD
    Log "Current branch: $Branch"
    if ($Branch -ne "main") { Warn "Not on main — will checkout main first" }

    if ($env:RELEASE_STRICT_CLEAN -eq "1") {
        Log "Strict clean check enabled"
        $Dirty = git status --porcelain
        if ($Dirty) { Die "Working tree is not clean." }
    } else {
        Log "Relaxed clean check"
    }

    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { Die "Rust toolchain not found" }

    Log ""
    Log "═══ Release plan (dry run) ═══"
    Log "1. git checkout main && git pull"
    Log "2. pnpm install --frozen-lockfile"
    Log "3. Rust: fmt, clippy, test"
    Log "4. TS: typecheck, test"
    Log "5. Bump version + CHANGELOG"
    Log "6. git commit + tag"
    Log "7. pnpm publish"
    Log "8. Smoke test"
    Log ""
    Log "═══ Dry run complete ═══"
    exit 0
}

# ---------------------------------------------------------------------------
# Interactive release
# ---------------------------------------------------------------------------

# Step 1: Checkout main
$Branch = git rev-parse --abbrev-ref HEAD
if ($Branch -ne "main") {
    Log "Switching to main"
    git checkout main
    git pull origin main
}

# Step 2: Clean check (relaxed)
$Dirty = git status --porcelain -- ':!scripts/' ':!.github/' ':!RELEASING.md' ':!.qwen/' ':!docs/'
if ($Dirty) { Die "Uncommitted changes: `n$Dirty" }

# Step 3: Install
Log "Installing dependencies"
pnpm install --frozen-lockfile | Out-Null

# Step 4: Rust gates
Log "Running Rust fmt check"
cargo fmt --check | Out-Null

Log "Running Rust clippy"
cargo clippy --all-targets --all-features -- -D warnings | Out-Null

Log "Running Rust tests"
cargo test --all-features | Out-Null

# Step 5: TS gates
Log "Running TypeScript typecheck"
pnpm typecheck | Out-Null

Log "Running TypeScript tests"
pnpm test | Out-Null

# Step 6: Determine bump
$Bump = $env:RELEASE_BUMP
$Summary = $env:RELEASE_SUMMARY

if (-not $Bump) {
    Write-Host ""
    Write-Host "═══ Current version: $CurrentVersion ═══" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Select bump:"
    Write-Host "  1) patch  → $(Get-SemVer patch $CurrentVersion)"
    Write-Host "  2) minor  → $(Get-SemVer minor $CurrentVersion)"
    Write-Host "  3) major  → $(Get-SemVer major $CurrentVersion)"
    Write-Host ""
    $Choice = Read-Host "Choose [1-3]"
    switch ($Choice) {
        "1" { $Bump = "patch" }
        "2" { $Bump = "minor" }
        "3" { $Bump = "major" }
        default { Die "Invalid choice" }
    }
    if (-not $Summary) { $Summary = Read-Host "One-line release summary" }
}

if (-not $Summary) { Die "RELEASE_SUMMARY is required" }

$NewVersion = Get-SemVer $Bump $CurrentVersion
Log "Bump: $CurrentVersion → $NewVersion ($Bump)"
Log "Summary: $Summary"

# Step 7: Write version
Log "Writing version $NewVersion"
$Pkg = Get-Content (Join-Path $PkgDir "package.json") | ConvertFrom-Json
$Pkg.version = $NewVersion
$Pkg | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $PkgDir "package.json")

# Step 8: CHANGELOG
$Changelog = Join-Path $PkgDir "CHANGELOG.md"
$Date = Get-Date -Format "yyyy-MM-dd"
if (-not (Test-Path $Changelog)) { "# Changelog`n" | Set-Content $Changelog -Encoding UTF8 }
$Old = Get-Content $Changelog -Raw
$NewEntry = "## $NewVersion ($Date)`n`n- $Summary`n"
($NewEntry + "`n" + $Old) | Set-Content $Changelog -Encoding UTF8

# Step 9: Commit + tag
Log "Committing release"
git add $PkgDir/package.json $Changelog
git commit -m "release: v$NewVersion — $Summary"
git tag "v$NewVersion"

# Step 10: Publish
Log "Publishing $PkgName@$NewVersion"
pnpm --filter better-uuid publish --access public

# Step 11: Push
Log "Pushing to origin"
git push origin main
git push origin "v$NewVersion"

# Step 12: Smoke test
Log "Running smoke test"
$SmokeDir = Join-Path $env:TEMP "better-uuid-smoke-$(Get-Date -Format yyyyMMddHHmmss)"
New-Item -ItemType Directory -Path $SmokeDir -Force | Out-Null
Set-Location $SmokeDir
npm init -y 2>&1 | Out-Null
try {
    npm install "$PkgName@$NewVersion" 2>&1 | Out-Null
    $Result = node -e "const b = require('$PkgName'); console.log(typeof b.createId)" 2>&1
} catch {
    Warn "Registry lag, retrying in 10s..."
    Start-Sleep -Seconds 10
    npm install "$PkgName@$NewVersion" 2>&1 | Out-Null
    $Result = node -e "const b = require('$PkgName'); console.log(typeof b.createId)" 2>&1
}
Set-Location $RootDir
Remove-Item $SmokeDir -Recurse -Force

if ($Result -eq "function") {
    Log "✅ Smoke test passed"
} else {
    Warn "⚠️ Smoke test result: $Result"
}

Log ""
Log "═══ Release complete ═══"
Log "Package: $PkgName@$NewVersion"
Log "Tag: v$NewVersion"
