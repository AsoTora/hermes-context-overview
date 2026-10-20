# Releases and installation

## Artifact contract

`package.json` is the authoritative version source. `scripts/release.py` (Python 3.10+ stdlib only) checks stable SemVer, the matching `plugin.yaml`, a unique first current changelog section with nonempty notes, private npm status and no production dependencies. `--tag vX.Y.Z` must exactly match. No npm publication is supported.

```sh
pnpm release:check --tag v1.2.2
pnpm gate
pnpm release:pack --tag v1.2.2
pnpm release:verify --tag v1.2.2
pnpm release:notes --tag v1.2.2
```

The outputs in ignored `dist/` are `hermes-context-overview-1.2.2.tar.gz`, `plugin.js`, `release-notes.md` and `SHA256SUMS`. SHA256SUMS covers the first three files. Notes are exactly the current changelog section, not auto-generated commit summaries. Archive files are sorted and allowlisted: root `plugin.yaml`, `desktop/plugin.js`, LICENSE, README, CHANGELOG, CONTRIBUTING, SECURITY, this document, verification and theme-review documentation, the four historical public demo screenshots and eight approved synthetic theme contact sheets (each named explicitly in `scripts/release.py`; no screenshot wildcard). Tar ownership, modes, timestamps and gzip headers are canonical. Rebuilding identical inputs on the same supported Python/zlib toolchain produces identical bytes; cross-zlib byte identity is not promised. No git metadata, dependencies, local evidence, tests, caches or secrets are collected. Verify checks both checksums and exact source content/layout, not just tar existence.

## Install a downloaded release

Download **all four assets from the same trusted tag/release** on `AsoTora/hermes-context-overview`. In the download directory:

```sh
# macOS (Linux: sha256sum --check SHA256SUMS)
shasum -a 256 -c SHA256SUMS
mkdir context-overview-package
# Only after verification, inspect and extract the trusted release archive.
tar -tzf hermes-context-overview-1.2.2.tar.gz
tar -xzf hermes-context-overview-1.2.2.tar.gz -C context-overview-package
```

The extracted package has an installable root layout for Hermes package tooling; downloading a tarball alone does not enable it. The currently inspected `hermes plugins install` CLI accepts catalog/Git identifiers, not arbitrary local archives. Do not pass this tarball to that CLI. To use the standalone Desktop mechanism, back up any existing entry, then copy the verified `plugin.js` to the running Desktop app's plugin root, normally `~/.hermes/desktop-plugins/hermes-context-overview/plugin.js`. Desktop frontend plugins are app-level: changing the connected gateway/profile does not select a different frontend installation. Do not derive this path from a backend profile's `HERMES_HOME`; use the app's configured plugin root if customized. Use Desktop's Plugins UI to inspect enablement and **Reload desktop plugins**. Do not overwrite a package-managed copy; upgrade it through its owning mechanism instead. No backend or Python registration is needed for the standalone entry.

For source/package-managed installation use the supported Hermes catalog/Git installer, optionally pinned with its immutable `--ref COMMIT_SHA`, rather than treating a mutable tag as an immutable SHA. Inspect `hermes plugins install --help` for the installed runtime's flags. Verify the installed entry's SHA-256 against the downloaded standalone asset and check the native two-conversation behavior described in [verification](verification.md). Compatibility requires the Desktop SDK ownership/statusbar surfaces as well as the declared Hermes RPC baseline.

### Upgrade and rollback

Record the current version and entry hash, keep its verified release assets, and disable before replacing a standalone entry. Install/verify the new entry, reload plugins, then check pointer/keyboard Context activation and untouched cache/t/s/RAM indicators. If needed, disable, restore the previous verified entry from backup/release, reload and recheck. Remove using the mechanism that owns the installation; no session data migration or cleanup is needed. Do not restart active sessions just for evidence.

## Maintainer runbook

1. Review source and private-metadata boundary; bump `package.json` and `plugin.yaml` together and add the first changelog section. Follow SemVer: patch for compatible fixes/tooling, minor for compatible functionality, major for incompatible behavior. Historical 1.0/1.1/1.2 milestones were not published tags.
2. Run `pnpm gate` from a clean isolated checkout and optional native validation separately. Inspect screenshot diffs and exact artifact contents. Never claim native rendering or security certification from harness/validator results.
3. Commit reviewed source; ensure CI for that exact commit is green. Tag that commit `vX.Y.Z` and push only with explicit publication authorization. Do not move an already published tag or overwrite release assets.
4. `.github/workflows/release.yml` runs on `v*` tag pushes. Its read-only verification jobs check the actual tag/version/changelog and run the same full gate on Node 22 and 24. The read-only artifact job rebuilds and verifies that exact tagged source only after both gates pass. Only the separate publish job has `contents: write`; it downloads named assets and creates the release with exact notes via the GitHub CLI. There is no deploy or npm publishing step.
5. Read back the release tag/commit and asset list; download and checksum the actual published assets before announcing success. A local passing gate is not hosted CI or publication evidence.

For a failed publish after all gates, inspect the failure and retry the failed job from the original tag run; there is no arbitrary-ref manual release bypass. If a release already exists, the creation command fails rather than clobbering it. Decide recovery explicitly. Roll back with a new reviewed patch release or restore a previous verified installed entry; never rewrite published history.
