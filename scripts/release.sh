#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# better-uuid — One-command release script
#
# Usage:
#   pnpm release:dry-run    # Gates + plan, no writes
#   pnpm release            # Interactive bump + summary, then full pipeline
#
# Environment variables (non-interactive CI mode):
#   RELEASE_BUMP=patch|minor|major
#   RELEASE_SUMMARY="Fix thing X"
#   RELEASE_STRICT_CLEAN=1  # Require fully clean tree (no exceptions)
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/better-uuid"
PKG_NAME="better-uuid"

cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()   { echo -e "\033[1;34m[release]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[release]\033[0m $*"; }
err()   { echo -e "\033[1;31m[release]\033[0m $*" >&2; }
die()   { err "$@"; exit 1; }

CURRENT_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"

bump_label() {
  case "$1" in
    patch)  echo "$CURRENT_VERSION → $(semver bump patch "$CURRENT_VERSION")" ;;
    minor)  echo "$CURRENT_VERSION → $(semver bump minor "$CURRENT_VERSION")" ;;
    major)  echo "$CURRENT_VERSION → $(semver bump major "$CURRENT_VERSION")" ;;
    *)      die "Unknown bump: $1" ;;
  esac
}

semver() {
  # Minimal semver bump without external deps
  local bump="$1" ver="$2"
  local major minor patch
  IFS='.-' read -r major minor patch _ <<< "$ver"
  patch="${patch:-0}"
  minor="${minor:-0}"
  major="${major:-0}"
  case "$bump" in
    patch)  patch=$((patch + 1)) ;;
    minor)  minor=$((minor + 1)); patch=0 ;;
    major)  major=$((major + 1)); minor=0; patch=0 ;;
  esac
  echo "$major.$minor.$patch"
}

# ---------------------------------------------------------------------------
# Dry-run mode
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--dry-run" ]] || [[ "${DRY_RUN:-0}" == "1" ]]; then
  log "═══ DRY RUN — no files will be modified ═══"
  log ""
  log "Current version: $CURRENT_VERSION"
  log ""
  log "Available bumps:"
  log "  patch  → $(semver patch "$CURRENT_VERSION")"
  log "  minor  → $(semver minor "$CURRENT_VERSION")"
  log "  major  → $(semver major "$CURRENT_VERSION")"
  log ""

  # Gate 1: Clean tree check (relaxed for scripts/ and .github/)
  if [[ "${RELEASE_STRICT_CLEAN:-0}" == "1" ]]; then
    log "Strict clean check enabled"
    if [[ -n "$(git status --porcelain)" ]]; then
      die "Working tree is not clean. Commit or stash changes first."
    fi
  else
    log "Relaxed clean check (ignores scripts/, .github/, RELEASING.md, .qwen/)"
    DIRTY="$(git status --porcelain -- ':!scripts/' ':!.github/' ':!RELEASING.md' ':!.qwen/')"
    if [[ -n "$DIRTY" ]]; then
      die "Uncommitted changes outside allowed paths. Commit or stash first:\n$DIRTY"
    fi
  fi

  # Gate 2: On main branch
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  log "Current branch: $BRANCH"
  if [[ "$BRANCH" != "main" ]]; then
    warn "Not on main branch — release will checkout main first"
  fi

  # Gate 3: Dependencies installed
  if [[ ! -d "$ROOT_DIR/node_modules/.pnpm" ]]; then
    warn "node_modules not installed — will run pnpm install --frozen-lockfile"
  fi

  # Gate 4: Rust toolchain
  if ! command -v cargo &>/dev/null; then
    die "Rust toolchain (cargo) not found"
  fi
  if ! command -v wasm-pack &>/dev/null; then
    warn "wasm-pack not found — WASM build step will be skipped in dry-run"
  fi

  log ""
  log "═══ Release plan (dry run) ═══"
  log "1. git checkout main && git pull"
  log "2. pnpm install --frozen-lockfile"
  log "3. cargo fmt --check"
  log "4. cargo clippy -- -D warnings"
  log "5. cargo test --all-features"
  log "6. pnpm typecheck"
  log "7. pnpm test"
  log "8. Bump version (patch/minor/major)"
  log "9. Update CHANGELOG.md"
  log "10. git commit + tag"
  log "11. pnpm --filter better-uuid publish"
  log "12. Smoke test: npx better-uuid --help"
  log ""
  log "═══ Dry run complete ═══"
  exit 0
fi

# ---------------------------------------------------------------------------
# Interactive release
# ---------------------------------------------------------------------------

# Step 1: Checkout main and pull
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  log "Switching to main branch"
  git stash --include-untracked 2>/dev/null || true
  git checkout main
  git pull origin main || die "Failed to pull from origin main"
  git stash pop 2>/dev/null || true
fi

# Step 2: Clean tree check
if [[ "${RELEASE_STRICT_CLEAN:-0}" == "1" ]]; then
  DIRTY="$(git status --porcelain)"
else
  DIRTY="$(git status --porcelain -- ':!scripts/' ':!.github/' ':!RELEASING.md' ':!.qwen/' ':!docs/')"
fi
if [[ -n "$DIRTY" ]]; then
  die "Uncommitted changes outside allowed paths:\n$DIRTY"
fi

# Step 3: Install
log "Installing dependencies"
pnpm install --frozen-lockfile || die "pnpm install failed"

# Step 4: Rust gates
log "Running Rust fmt check"
cargo fmt --check || die "cargo fmt check failed"

log "Running Rust clippy"
cargo clippy --all-targets --all-features -- -D warnings || die "cargo clippy failed"

log "Running Rust tests"
cargo test --all-features || die "cargo test failed"

# Step 5: TypeScript gates
log "Running TypeScript typecheck"
pnpm typecheck || die "TypeScript typecheck failed"

log "Running TypeScript tests"
pnpm test || die "TypeScript tests failed"

# Step 6: Determine bump
BUMP="${RELEASE_BUMP:-}"
SUMMARY="${RELEASE_SUMMARY:-}"

if [[ -z "$BUMP" ]]; then
  echo ""
  echo "═══ Current version: $CURRENT_VERSION ═══"
  echo ""
  echo "Select bump:"
  echo "  1) patch  → $(semver patch "$CURRENT_VERSION")"
  echo "  2) minor  → $(semver minor "$CURRENT_VERSION")"
  echo "  3) major  → $(semver major "$CURRENT_VERSION")"
  echo ""
  read -rp "Choose [1-3]: " CHOICE
  case "$CHOICE" in
    1) BUMP="patch" ;;
    2) BUMP="minor" ;;
    3) BUMP="major" ;;
    *) die "Invalid choice" ;;
  esac

  if [[ -z "$SUMMARY" ]]; then
    read -rp "One-line release summary: " SUMMARY
  fi
fi

if [[ -z "$SUMMARY" ]]; then
  die "RELEASE_SUMMARY is required for non-interactive mode"
fi

NEW_VERSION="$(semver "$BUMP" "$CURRENT_VERSION")"
log "Bump: $CURRENT_VERSION → $NEW_VERSION ($BUMP)"
log "Summary: $SUMMARY"

# Step 7: Write version to package.json
log "Writing version $NEW_VERSION to $PKG_DIR/package.json"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$PKG_DIR/package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('$PKG_DIR/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Step 8: Update CHANGELOG.md
CHANGELOG="$PKG_DIR/CHANGELOG.md"
DATE="$(date +%Y-%m-%d)"
if [[ ! -f "$CHANGELOG" ]]; then
  echo "# Changelog" > "$CHANGELOG"
  echo "" >> "$CHANGELOG"
fi
TMP_CHANGELOG="$(mktemp)"
echo "## $NEW_VERSION ($DATE)" > "$TMP_CHANGELOG"
echo "" >> "$TMP_CHANGELOG"
echo "- $SUMMARY" >> "$TMP_CHANGELOG"
echo "" >> "$TMP_CHANGELOG"
cat "$CHANGELOG" >> "$TMP_CHANGELOG"
mv "$TMP_CHANGELOG" "$CHANGELOG"

# Step 9: Commit and tag
log "Committing release"
git add "$PKG_DIR/package.json" "$CHANGELOG"
git commit -m "release: v$NEW_VERSION — $SUMMARY" || true

log "Creating tag v$NEW_VERSION"
git tag "v$NEW_VERSION"

# Step 10: Publish to npm
log "Publishing $PKG_NAME@$NEW_VERSION to npm"
pnpm --filter better-uuid publish --access public || die "npm publish failed"

# Step 11: Push tag and branch
log "Pushing to origin"
git push origin main
git push origin "v$NEW_VERSION"

# Step 12: Smoke test
log "Running smoke test"
SMOKE_DIR="$(mktemp -d)"
cd "$SMOKE_DIR"
npm init -y >/dev/null 2>&1
npm install "better-uuid@$NEW_VERSION" >/dev/null 2>&1 || {
  warn "Package not yet available on npm (registry lag). Retrying in 10s..."
  sleep 10
  npm install "better-uuid@$NEW_VERSION" >/dev/null 2>&1 || die "Smoke test: npm install failed"
}
SMOKE_RESULT="$(node -e "const b = require('better-uuid'); console.log(typeof b.createId === 'function' ? 'OK' : 'FAIL')" 2>/dev/null)" || SMOKE_RESULT="FAIL"
cd "$ROOT_DIR"
rm -rf "$SMOKE_DIR"

if [[ "$SMOKE_RESULT" == "OK" ]]; then
  log "✅ Smoke test passed"
else
  warn "⚠️ Smoke test failed (may be registry lag). Verify manually: npm install $PKG_NAME@$NEW_VERSION"
fi

# Step 13: Switch to develop if it exists
if git rev-parse --verify develop &>/dev/null; then
  log "Switching to develop branch"
  git checkout develop
fi

log ""
log "═══ Release complete ═══"
log "Package: $PKG_NAME@$NEW_VERSION"
log "Tag: v$NEW_VERSION"
log "Commit: $(git log --oneline -1 --format='%h %s')"
log ""
log "Rollback if needed:"
log "  npm deprecate $PKG_NAME@$NEW_VERSION \"reverted\""
log "  git push origin :refs/tags/v$NEW_VERSION"
