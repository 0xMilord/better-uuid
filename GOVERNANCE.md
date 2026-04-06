# Governance — lighter-weight

This is a small open-source project; we keep governance **minimal** and **transparent**.

## Roles

- **Maintainers:** Merge PRs, cut releases, own roadmap prioritization, and moderate the Code of Conduct. Listed implicitly by GitHub org/repo ownership. Add a [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) file when you want automatic review routing.  
- **Contributors:** Anyone who opens issues or PRs under [CONTRIBUTING.md](CONTRIBUTING.md).

## Decision-making

- **Day-to-day:** Maintainer discretion on merges, guided by [PRD.md](PRD.md), [ROADMAP.md](ROADMAP.md), and consensus in issue discussion.  
- **API / wire-format breaks:** Major semver bump; document in CHANGELOG and, where possible, discuss in an issue for at least several days before merge (see [CONTRIBUTING.md](CONTRIBUTING.md)).  
- **Security:** Follow [SECURITY.md](SECURITY.md); no public exploit detail before a fix is available when coordinated disclosure applies.

## Releases

The primary maintainer flow is documented in [RELEASING.md](RELEASING.md) (`scripts/release.mjs`). Versioning follows semver for the **npm package**; Rust workspace version may track the same release train.

## Changes to governance

Edits to this file or to the Code of Conduct go through a normal PR with clear rationale.
