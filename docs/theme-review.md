# Theme support — 1.2.4

The popup follows all 12 built-in themes and their 24 light/dark palettes through native CSS tokens. This document covers the design, the review evidence and its limits; it is not live Desktop verification.

## Design

The popup derives plugin-local `--co-*` roles from native `--ui-*` and `--context-usage-*` variables. It has no theme-name map, host DOM detection, settings, or theme subscriptions. Native token changes update the open popup through CSS alone.

The native elevated background remains unchanged. The grid carries the accent, while allocation rows use small semantic swatches and neutral dividers. Free cells have explicit outlines. Secondary copy uses near-primary native ink because some native secondary colors do not meet normal-text contrast requirements. Size and spacing provide hierarchy instead of low contrast. A 660px maximum height accommodates the built-in monospace theme without clipping its default footer. Available-height constraints and scrolling still apply to smaller windows and expanded details.

Context requests, counts, normalization, ownership checks, privacy, focus handling, and refresh behavior are unchanged.

## Native fixture provenance

`tests/fixtures/native-themes/provenance.json` records SHA-256 hashes for seven native source files at Hermes revision `d923a5eb487a17c0a68801bba9ef0f56c81040a8`. The fixture retains the native MIT license.

`scripts/theme-fixtures.mjs` verifies the source bytes against that revision before it builds the portable fixture. The fixture includes the actual built-in registry, Classic skin converter, shared palettes, color helpers, palette selection, synthesized light colors, theme application, and root CSS custom properties. It does not substitute guessed light or dark overrides.

There are 12 built-ins and 24 native palettes. Nous, GitHub, Catppuccin, Everforest, Solarized, Nous Alt, and Classic have explicit light and dark palettes. Midnight, Ember, Mono, Slate, and Cyberpunk use their dark seed in dark mode and the native `synthLightColors` function in light mode. Calling these themes dark-only does not mean that the Desktop light switch leaves them dark.

The generated fixture runs without the installed Hermes checkout. Only fixture refresh needs a pinned checkout:

```sh
pnpm fixtures:themes /path/to/hermes-agent
```

## Public screenshots

`pnpm screenshots:docs` writes the four public images under `docs/screenshots/`: `overview-{dark,light}.png` (the popover above the status bar) and `themes-{dark,light}.png` (one popover per built-in theme). They render the real plugin entry with demo data and contain no review labels.

## Reproducing review evidence

`pnpm screenshots:themes` generates ignored local review evidence:

- `index.html` is the offline approval gallery.
- `<theme>-<light|dark>-<1280|390>.png` contains each actual popup and a synthetic-data label. There are 48 popup PNGs.
- `sheet-<light|dark>-<1280|390>-<1|2>.png` groups six popups per contact sheet. There are eight sheets.
- `narrow-unknown.png` shows the unknown-budget state at narrow width. `narrow-metadata-expanded.png` shows expanded file metadata.
- `report.json` records text contrast, cell and swatch visibility, overflow checks, palette coverage, console errors, unexpected requests, and candidate hashes.

The browser test measures computed colors after Chromium resolves native CSS and alpha composition. It requires normal popup text contrast of at least 4.5:1, distinct visible swatches, visible free-cell boundaries, unchanged cell counts, no horizontal overflow, and no default footer clipping. It switches every palette while the same popup stays mounted and confirms that theme changes make no extra context request. Existing behavior tests remain part of `pnpm gate`.

`pnpm gate` includes the theme test and creates local package archives as an existing gate step. These archives are not publication or installation. Generated reports and captures stay ignored and are not release assets; only the four public screenshots are packaged. The browser tests write their captures to ignored local evidence.

## Limits

All data is demo data and the screenshots come from the browser harness, not live Desktop. The palette calculations and native CSS variables are exact pinned code. React, React Query, and Radix are real, but the Desktop host, routing, and SDK Button are test adapters.

The fixture replaces app-store bindings and native-window side effects with inert test bindings. It suppresses remote font downloads and uses local font fallbacks. It does not reproduce user accent overrides, custom CSS, Electron window materials, translucency, OS rendering, or user-selected chat fonts. Native SDK styling may add layout differences. Live Desktop verification remains unperformed, and these screenshots do not claim otherwise.
