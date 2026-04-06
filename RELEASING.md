# RELEASING — better-uuid

## One-command release

Implementation: **`scripts/release.mjs`** (Node — works on Windows without PowerShell Core).

If **`pnpm` is not on your PATH** (typical when you only use `npm run …`), the script falls back to **`npm exec -- pnpm …`**. You can also install pnpm globally or run `corepack enable` per the [pnpm install docs](https://pnpm.io/installation).

From the **repository root** (pnpm workspace):

```bash
# Dry run (recommended first)
pnpm release:dry-run     # Runs gates, prints plan, no git/npm writes
# npm works too: npm run release:dry-run

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
8. **`pnpm --filter better-uuid build`** — `dist/` and `wasm/` are gitignored; without this step the npm tarball would only contain `package.json` + `LICENSE`.
9. `pnpm --filter better-uuid publish --access public --no-git-checks` (build outputs are gitignored; without this flag, pnpm errors with `ERR_PNPM_GIT_UNCLEAN` after the release commit)
10. `git push origin main` + `git push origin vX.Y.Z`
11. Smoke test: **`npm view pkg@version`** polling (up to ~3 min) until the registry lists the new release, then **`npm install --prefer-online`** with retries — replication lag after publish often caused `ETARGET` on a single 10s delay

If any step fails, the script stops.

### Non-interactive (CI or scripts)

**Windows: PowerShell is not CMD.** Do not use `set KEY=value` in PowerShell—that either errors or does the wrong thing. Use `$env:KEY = "value"` and **quote strings that contain spaces.**

```powershell
# Windows PowerShell
$env:RELEASE_BUMP = "patch"
$env:RELEASE_SUMMARY = "Fix the thing"
pnpm release
# or one line:
$env:RELEASE_BUMP = "patch"; $env:RELEASE_SUMMARY = "Fix the thing"; pnpm release
```

```bat
REM Windows CMD (Command Prompt only)
set RELEASE_BUMP=patch
set "RELEASE_SUMMARY=Fix the thing"
pnpm release
```

```bash
# Unix / Git Bash
export RELEASE_BUMP=patch
export RELEASE_SUMMARY="Fix the thing"
pnpm release
```

(Alternative: `pnpm release:unix` runs `scripts/release.sh` if you prefer bash.)

### Clean tree policy

`pnpm release` requires a clean enough tree. Uncommitted edits are allowed only under:

- `scripts/` (release tooling)
- `.github/` (CI workflows)
- `RELEASING.md` (this file)
- `.qwen/` (local agent/IDE settings)
- `docs/` (documentation site)

**Not** ignored: the repo **root** `package.json`, `pnpm-lock.yaml`, Rust/TS sources, etc. Commit or stash those before releasing (the script bumps `packages/better-uuid/package.json` only).

**Troubleshoot:** If you see `Uncommitted changes: M package.json`, that is almost always the **root** `package.json`—stage/commit it, or stash, then run release again.

For a fully clean tree only: **PowerShell** `$env:RELEASE_STRICT_CLEAN = "1"` · **CMD** `set RELEASE_STRICT_CLEAN=1` · **Unix** `export RELEASE_STRICT_CLEAN=1`

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
