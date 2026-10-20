# Changelog

Versions describe source milestones; the 1.0.0–1.2.0 entries were not previously tagged GitHub releases. Dates are 2026-10-20, when these changes landed.

## [1.2.1] - 2026-10-20

### Added
- Context viewing and manual refresh during a running turn, with a clear latest-snapshot/usage-lag notice; same-owner replies survive busy transitions and completion/compression still refresh metadata.
- Monochrome context-usage SVG beside the single bottom status-bar Context label; decorative and nonfocusable, preserving native activation and the accessible name.
- Reproducible allowlisted release archive, standalone entry, exact changelog notes and SHA-256 checksums, with fail-closed version/tag/content gates and negative tests.
- Pinned least-privilege CI and tag-release workflows, Node 22/24 checks, maintainer, installation and security documentation.

### Preserved
- Existing prompt-cache hit-rate indicator, focused ownership routing, read-only metadata boundary and zero production dependencies.

## [1.2.0] - 2026-10-20

- Moved the inspector to one bottom `statusBar.right` contribution, separate from existing cache/performance indicators (`9be2c65`).
- Removed composer controls and retained activation-bound focused-session ownership, route isolation and browser-harness regression evidence.

## [1.1.0] - 2026-10-20

- Moved context into each conversation composer instead of a global overview (`91db637`).
- Bound queries to conversation ownership and improved split-conversation routing and lifecycle coverage.

## [1.0.0] - 2026-10-20

- Introduced the native Context Overview entry using existing context-breakdown metadata, occupancy visualization, estimates and context-file metadata (`6ead83d`).
- Added synthetic browser-harness tests, MIT licensing and theme-token attribution.
