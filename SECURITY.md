# Security policy

## Supported versions

We commit to releasing security fixes for the **latest minor** of the current **major** npm version (e.g. `0.x` latest). Older lines may not receive backports; upgrade when advised.

## Reporting a vulnerability

**Please do not open a public issue** for security reports.

1. Use **[GitHub private vulnerability reporting](https://github.com/better-uuid/better-uuid/security/advisories/new)** for this repository, if enabled by maintainers.
2. If that is unavailable, contact maintainers via the **[Security](https://github.com/better-uuid/better-uuid/security)** tab and follow GitHub’s disclosure guidance.

Include:

- Affected version(s) or commit range  
- Runtime (Node / browser / edge) and minimal reproduction if possible  
- Impact assessment (confidentiality / integrity / availability) if you can  

We aim to acknowledge reports within **5 business days** and coordinate an advisory and patch release when appropriate.

## Scope (typical)

In scope: ID generation, parsing, WASM boundary, cryptographic randomness / collision assumptions documented for strategies, and supply-chain aspects of published npm artifacts.

Out of scope: third-party apps misusing the library, purely hypothetical attacks without a practical path, or issues in dependents unless they stem from this package.

## Disclosure

We follow coordinated disclosure: we prefer to publish a fix before public technical detail, unless otherwise required by law or reporter agreement.
