# Contributing to better-uuid

Thank you for your interest. This project follows an **architecture-first** workflow — read the docs before opening a PR.

---

## 1. Read before coding

| Doc | Why |
|-----|-----|
| [PRD.md](PRD.md) | What we're building and why |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it's structured — Rust core, WASM boundary, TS API |
| [ROADMAP.md](ROADMAP.md) | What phase we're in, what ships next |
| [ADOPTION.md](ADOPTION.md) | Migration story — don't break this |
| [docs/formats.md](docs/formats.md) | Wire format and alphabet specs |

**Rule:** If your change affects a cross-cutting concern (wire format, error taxonomy, strategy IDs), **update all three docs** (PRD, ARCHITECTURE, ROADMAP).

---

## 2. One-command setup

```bash
# Prerequisites: Rust (stable, via rustup), Node 22+, pnpm 10+
pnpm install
cargo build
pnpm ci:all
```

If `pnpm ci:all` passes, your environment is correct.

---

## 3. How to contribute

### Bug reports

Use the [bug report form](https://github.com/better-uuid/better-uuid/issues/new?template=bug_report.yml). Include:
- Runtime (Node version, browser, Edge)
- better-uuid version (or commit SHA)
- Minimal reproduction
- Expected vs actual output

### Feature requests

Use the [feature request form](https://github.com/better-uuid/better-uuid/issues/new?template=feature_request.yml). Every feature must map to:
- A PRD requirement ID (e.g. R3, A1)
- A ROADMAP phase
- An ARCHITECTURE section it affects

### Pull requests

1. **Branch off `main`.**
2. **Run `pnpm ci:all`** before pushing.
3. **Link the issue** your PR closes.
4. **Update docs** if you change API surface, wire format, or error types.
5. **Add tests** — Rust: `cargo test`, TS: `pnpm test`.

**No PR without an issue** (except trivial typos/docs fixes).

---

## 4. Coding conventions

### Rust

- `cargo fmt` + `cargo clippy -- -D warnings` — **CI-gated**.
- `#![forbid(unsafe_code)]` on the core crate.
- Errors use `thiserror` — no stringly-typed `Result<String, String>`.
- Property tests via `proptest` for encode/decode roundtrips (Phase 1+).

### TypeScript

- Biome for linting/formatting — **CI-gated**.
- Strict mode: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- No `any` — use `unknown` + type guards.
- All public APIs documented with JSDoc.

### Git

- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- Squash-merge to `main`.
- Breaking changes = `feat!:` or `BREAKING CHANGE:` footer → major semver bump.

---

## 5. Testing strategy

| Layer | Command | What it covers |
|-------|---------|---------------|
| Rust unit | `cargo test --all-features` | Strategies, encoding, parsing, validation |
| Rust property | `proptest` (Phase 1) | Roundtrip encode/decode for all strategies |
| WASM | `wasm-pack test --headless` (Phase 2) | Boundary correctness, JSValue serialization |
| TS | `pnpm test` | API surface, compat modules, error paths |
| Cross-runtime | Smoke tests (Phase 3) | Node 22, Edge runtime compatibility |

**Golden master:** Rust generates 10k fixture vectors → TS tests verify identical output (Phase 1).

---

## 6. Release process

Maintainers use **`scripts/release.mjs`** (`pnpm release`). See **[RELEASING.md](RELEASING.md)** for the full checklist, including **`pnpm --filter better-uuid build`** before publish and **`--no-git-checks`** (local `dist/` / `wasm/` are gitignored).

**Breaking wire-format changes = major version.** We never silently change decode behavior for existing schema versions.

---

## 7. Governance

See **[GOVERNANCE.md](GOVERNANCE.md)** and **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)**.

- RFCs for API-breaking changes: aim for **at least a few days** of issue discussion before merge when practical.
- **Security:** see **[SECURITY.md](SECURITY.md)** — do not open a public issue for vulnerabilities.

---

*This project treats identifiers as engineering artifacts. Treat them with respect.*
