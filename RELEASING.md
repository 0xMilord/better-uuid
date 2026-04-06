# RELEASING — better-uuid

## One-command release

From the **repository root** (pnpm workspace):

```bash
# Dry run (recommended first)
pnpm release:dry-run     # Runs gates, prints plan, no git/npm writes

# Full release (interactive)
pnpm release             # Interactive bump (patch/minor/major) + summary, then full pipeline
```

### What `pnpm release` does

1. `git checkout main` and `git pull origin main`
2. `pnpm install --frozen-lockfile`
3. `cargo fmt --check` → `cargo clippy -- -D warnings` → `cargo test --all-features`
4. `pnpm typecheck` → `pnpm test`
5. Logs current version, prompts for **bump** (1=patch, 2=minor, 3=major) and **one-line summary**
6. Writes `packages/better-uuid/package.json` version and prepends `CHANGELOG.md`
7. `git commit` + `git tag vX.Y.Z`
8. `pnpm --filter better-uuid publish --access public`
9. `git push origin main` + `git push origin vX.Y.Z`
10. Smoke test: temp directory `npm install better-uuid@X.Y.Z` and verifies `createId` is a function
11. If branch `develop` exists, switches to it

If any step fails, the script stops.

### Non-interactive (CI or scripts)

```bash
# PowerShell (Windows)
$env:RELEASE_BUMP = "patch"
$env:RELEASE_SUMMARY = "Fix thing X"
pnpm release

# Unix
export RELEASE_BUMP=patch
export RELEASE_SUMMARY="Fix thing X"
pnpm release:unix
```

### Clean tree policy

`pnpm release` requires a clean enough tree. Uncommitted edits are allowed only under:

- `scripts/` (release tooling)
- `.github/` (CI workflows)
- `RELEASING.md` (this file)
- `.qwen/` (local agent/IDE settings)
- `docs/` (documentation site)

For a fully clean tree only, set `RELEASE_STRICT_CLEAN=1`.

### Rollback

- **npm:** `npm deprecate better-uuid@X.Y.Z "message"` or unpublish within npm policy windows
- **git:** Delete local/remote tag: `git push origin :refs/tags/vX.Y.Z`

## GitHub Actions

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR / push to `main` | Rust fmt + clippy + test, TS typecheck + test |
| `release.yml` | `workflow_dispatch` (manual) | Build + npm publish with version bump |
| `docs.yml` | Push to `main` (docs/**) | Build + deploy static docs to GitHub Pages |

Configure `NPM_TOKEN` secret for the manual release workflow.

## Versioning strategy

| Bump | When |
|------|------|
| **patch** | Bug fixes, docs, no API changes |
| **minor** | New strategies, new API surface, backward-compatible |
| **major** | Wire format change, breaking API change, `schemaVersion` bump |

### Changesets (optional)

The repo includes `@changesets/cli` for optional versioning PRs. The primary maintainer flow above does **not** require `.changeset/*.md` files.

To publish via Changesets: `pnpm version-packages` then `pnpm publish:changesets`.
