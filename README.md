# Context Overview for Hermes Desktop

A native, persistent full-page context inspector: **100-cell model budget**, authoritative occupancy/free space, estimated category costs, and context-file load provenance. Read-only, no runtime dependencies, no Python backend, no new collector.

Open **Context Overview** in the sidebar or **Open Context Overview** in the command palette. The page follows the focused conversation (including split-session tiles); Refresh updates the same session, not a copied transcript.

![Synthetic SDK harness, dark wide layout](docs/screenshots/harness-dark-1280.png)

**Screenshot disclosure:** these images show the actual plugin entry rendered in a **synthetic SDK browser harness**, not an installed live Hermes Desktop app. All identifiers, paths, model names, and numbers are public synthetic examples. [Narrow light](docs/screenshots/harness-light-390.png), [wide light](docs/screenshots/harness-light-1280.png), [narrow dark](docs/screenshots/harness-dark-390.png).

## What the numbers mean

- **Occupied tokens and free budget** use `context_used` and `context_max` from `session.context_breakdown`. Source is labeled as provider usage, provider usage plus estimated delta, local estimate, or unknown. Free space never comes from the category sum.
- **100 cells** represent overall model-window occupancy/free space, rounded to nearest 1%. Cells are not attributed to categories: doing so would imply estimated categories were measured provider totals. Over-budget values cap the picture at 100% but keep an explicit excess warning. Unknown budget is never painted as free.
- **Estimated allocation** preserves gateway category estimates and order, including a measured zero-token conversation row. Percentages mean **percent of the model window**, not percent of the category sum. An absent optional category is not an invented zero. The reported estimate total, row sum and occupancy remain separate; differences are explained, never silently rescaled.
- **Context files** show only reported label, path, character count, token estimate, loaded flag and status. File estimates are not added to the category total again. A missing manifest means no metadata was supplied, not that no files exist.
- Individual tool names/counts, per-skill bodies/costs, raw system prompt, message bodies, and memory contents are **not supplied by this RPC** and are not fabricated or fetched by this plugin.

A session title is not exposed by the inspected readonly SDK state or this RPC. The heading therefore says **Focused session** (or **Active session** on older SDKs), with owning profile and runtime ID as secondary metadata. No message previews or session-body requests are used to synthesize a name.

## Requirements and compatibility

`plugin.yaml` declares **Hermes >=0.22.2**. This is a necessary baseline, not a guarantee that every historical Desktop build has the required surface. The host must provide the native Desktop SDK, route/sidebar/palette contributions, React Query, and `session.context_breakdown`.

Implementation was checked against the installed runtime at `d923a5eb487a17c0a68801bba9ef0f56c81040a8` and the current official SDK reference supplied during development. The plugin uses namespace imports and feature detection for newer state:

- `focusedSessionId`, falling back to `activeSessionId` only when the focused atom is absent;
- connection-qualified `focusedSessionOwner`, `connectionId` and owning profile;
- exact descriptors from `profileRoutes()` with `requestProfile()` for a split session on another connection/profile;
- `host.request()` for the matching ambient gateway;
- optional `getGateway()` object identity plus connection/profile/gateway lifecycle generations to isolate reconnects.

An unresolved owner or missing/ambiguous remote route fails closed. Missing RPC methods produce an inline compatibility message, with no retry storm. Zero/missing model windows retry twice, then show no-data rather than stale numbers. No legacy collector or private core import is used as a fallback.

## Install / enable / remove

Installation and confirmed live rendering are separate from source-level testing. The browser harness does not establish that a running Desktop window loaded the plugin; no application restart is required by this plugin.

For a standalone native disk installation, copy only `desktop/plugin.js` to:

```text
$HERMES_HOME/desktop-plugins/hermes-context-overview/plugin.js
```

The containing folder must match the plugin ID. A standalone disk installation defaults to enabled (`defaultEnabled: true`), while respecting any existing explicit disable choice. If it does not appear, use **Reload desktop plugins** in the command palette and check **Context Overview** in Desktop's Plugins UI. The unified package (`plugin.yaml` plus `desktop/plugin.js`) can instead be installed using `hermes plugins install AsoTora/hermes-context-overview --enable`. Package-managed Desktop copies remain opt-in under the host's policy: enable the Desktop half through the Plugins UI if needed. When using a package, Desktop runs an app-root copy; use **Rescan** to synchronize it if needed. No Python backend enablement is needed. No restart is required by the plugin.

To roll back, disable the plugin, then remove its standalone folder or uninstall its package using the owning install mechanism. It writes no settings, sessions, files, credentials or plugin storage, so there is no application data to migrate or undo. Do not manually delete a package-managed app-root copy while leaving its source installed.

## Read-only / privacy boundary

The production file imports only `@hermes/plugin-sdk`, `react`, and `react/jsx-runtime`. It requests **only `session.context_breakdown`** through the host, reads public connection/session state and route descriptors, and navigates its own route. It never reads the filesystem, config, credentials, transcripts or raw prompts; never calls a vendor API, runs inference, sends telemetry, executes tools, or patches global DOM/core behavior. Gateway-returned file paths and labels can still be sensitive metadata: this plugin displays them locally, does not export them, and does not copy them into screenshots/tests/logs.

Refresh is page-scoped React Query: 60-second idle polling, no background-tab polling, bounded retries, explicit refresh, and relevant completion/compression/reclaim events. Busy/disconnected sessions show no old budget. Query keys include connection, profile, focused owner, runtime session, gateway instance and lifecycle/revision identity; pending old-scope results are discarded. Listeners and query observers leave on unmount/disable.

## Development and tests

Only dev/test dependencies are installed. The production plugin is plain ESM and has no build step.

```sh
pnpm install --frozen-lockfile --ignore-scripts
PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright pnpm exec playwright install chromium
node --check desktop/plugin.js
pnpm test
hermes plugins doctor --ci .
hermes plugins validate . --install-deps
```

Linux CI uses `playwright install --with-deps chromium` on a Node runner, not a Docker Hub image. `pnpm test` builds a test-only bundle, registers the **actual production plugin**, mounts its route with real React and React Query, and drives its API/query path in Chromium. The SDK host and native Button are explicitly synthetic seams. Source-import checks, normalization/budget conservation tests, race/error/lifecycle checks, metadata safety checks and four screenshot exports are included. The harness cannot prove native loader integration, theme/component parity, or a live gateway response.

**Known tooling limitation:** the inspected `hermes plugins doctor --ci .` fails `No __init__.py` for this Desktop-only package because its doctor path unconditionally attempts Python registration. A dummy Python entry was deliberately not added to disguise this limitation. The same runtime's `hermes plugins validate . --install-deps` recognizes `desktop/plugin.js` as the entry and passes, with a capability-probe-skipped warning. See [verification](docs/verification.md) for exact local evidence and remaining live checks.

## Distinction from existing surfaces

Core already has a small statusbar context popover; this plugin adds a persistent, readable full page, 100-cell occupancy visualization and comprehensive metadata table without forking that component. Catalog `context-audit` (ZidoCode, MIT, reviewed at `2aaa96aab2c685798b011a5d6479a4a1fa6a033f`) addresses hook-based CLI context forensics, not a native Desktop context viewer. This package reuses the native RPC rather than copying that collector or any bundled plugin.

MIT · AsoTora. Test theme-token provenance is recorded in `tests/harness-theme.css` and `LICENSE`.
