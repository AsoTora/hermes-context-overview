# Contributing

Use Node 22 or 24, pnpm 10.33.0 and Python 3.10+ (stdlib only). Production remains plain ESM: do not add runtime packages, a backend, collectors, raw-body requests or core-app patches.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
pnpm gate
```

`pnpm gate` is the canonical portable CI/release gate: syntax and source contract, all entry/browser tests, release contract/artifact negative tests, packaging and content/checksum verification. Set `PLAYWRIGHT_BROWSERS_PATH` to reuse an existing Chromium cache. Linux runners use `playwright install --with-deps chromium`. Offline installs can add `--offline` if the lockfile dependencies are cached. No Hermes installation is required by this gate.

Run focused tests while iterating. Tests render the actual plugin entry with real React, React Query and Radix but a synthetic SDK/focus/RPC host; never label them live Desktop evidence. Test captures go to ignored `.local/`. `pnpm screenshots:docs` regenerates the four public PNGs under `docs/screenshots/`; inspect them before committing. Keep private paths, prompts and identifiers out of fixtures and evidence.

Preserve exactly one bottom `statusBar.right` Context control and the existing prompt-cache indicator. Cover pointer/keyboard activation, accessible name and decorative icon, focused ownership, lazy queries and stale-result isolation when changing this surface. Context must remain readable and manually refreshable during a running turn, with a usage-lag notice rather than a busy-state block.

For optional native validation, `hermes plugins validate . --install-deps` and `hermes plugins doctor --ci .` run separately from the portable gate. Doctor currently fails `No __init__.py` for this Desktop-only package. Do not add a Python shim to conceal it. See [verification](docs/verification.md).

Use focused conventional commits and a concise PR description. Update [CHANGELOG](CHANGELOG.md), matching `package.json` and `plugin.yaml` versions, and [release instructions](docs/releases.md) when relevant. Include actual test results and disclose checks not run. Never modify credentials, repository settings, or publish a release as part of a routine contribution.
