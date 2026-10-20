# Verification boundary — 1.1.0

## Results

The actual production ESM contribution passed **22 tests: 14 Chromium browser-harness tests plus 8 entry/normalization/privacy tests**, with no failures or skips. These use real React, React Query and Radix UI **1.6.7**, matching the inspected Desktop dependency. SDK atoms/RPC/events, contribution registry, native Button/wrapper styling and host focus routing are explicit synthetic seams.

| Command | Result | Retained evidence |
| --- | --- | --- |
| `node --check desktop/plugin.js` | exit 0 | `.local/final-node-check.log` |
| `pnpm test` | 22 pass, 0 fail, 0 skip | `.local/final-tests.log` |
| `hermes plugins doctor --ci .` | **exit 1**, known Desktop-only tooling limitation | `.local/final-doctor.log` |
| `hermes plugins validate . --install-deps` | exit 0; SDK surface valid; documentation-only `context_exfil` heuristic caution | `.local/final-validate.log` |

`node scripts/verify.mjs` preserves command output and writes `.local/evidence.json` with command exit codes, log SHA-256 values and a sorted candidate file/size/SHA-256 inventory. The script exits 1 while doctor fails; it never turns that failure into a passing check. Local validation reused the original checkout’s existing Playwright browser cache through `PLAYWRIGHT_BROWSERS_PATH`; dev dependencies were installed only in this isolated worktree using pnpm. No Hermes dependencies or browsers were installed into the runtime checkout.

The doctor tries Python registration and fails `No __init__.py` for this Desktop-only package. The native-aware validator accepts `desktop/plugin.js`, skips Python capability probing, reports portable/no Python and passes. No dummy Python shim was added. Doctor coverage is unavailable, not a native renderer failure or a passing gate.

## Why activation can identify the owning composer

Inspected runtime reference: `d923a5eb487a17c0a68801bba9ef0f56c81040a8`. Relevant files under `apps/desktop/src/`:

- `app/chat/composer/contrib.ts:31–41`: `COMPOSER_AREAS.actions = 'composer.actions'`.
- `app/chat/composer/index.tsx:1544–1546`: every composer mounts that inline slot immediately before its controls.
- `contrib/react/slot.tsx:10–22`: render callbacks receive **no composer/session props**. Private `useComposerScope` / `useSessionView` are not SDK exports and are not imported.
- `components/pane-shell/tree/renderer/index.tsx:38–45`: the tree root installs `trackActiveTreeGroup`.
- `components/pane-shell/tree/store.ts:542–578`: the host resolves the event’s owning tree group and publishes it from **window capture listeners** for `pointerdown` and `focusin`.
- `store/session-focus.ts:46–92`: interacted group / active chat pane derives focused stored session identity; SDK `host.state.focusedSessionId` / `focusedSessionOwner` expose runtime identity and connection-qualified ownership.
- `components/ui/popover.tsx`: native SDK Popover delegates to Radix, portals the content and forwards normal focus/dismissal props. `apps/desktop/package.json` pins `radix-ui` at 1.6.7.

Window capture runs before the button’s React pointer/focus/key handlers and the trigger’s click/open handler. The plugin captures the public focused identity at activation, not at mount, and never retargets an open instance. Inactive composers show the generic Context label and issue no requests. It neither reads those private DOM markers itself nor installs global handlers.

**Emulated host seam:** `tests/harness.mjs` renders two conversation sections and mounts the actual registered contribution once per composer. Its window-capture pointer/focus handler reproduces the inspected host’s ordering and maps each synthetic group to a different runtime session/owner. It does not mount the real Desktop tree/store. This establishes browser behavior under the source-derived routing contract, not live Desktop integration. Other layouts/versions without that routing have not been qualified.

`composer.microActions` was inspected but is unnecessary: its provider receives a session ID, while the returned action is a host-rendered badge with no custom popover anchor/render lifecycle. The regular inline action plus the existing focus routing preserves a native conversation-local trigger and per-instance state without extra global coordination.

## Covered behavior

- **Actual registration boundary:** only `composer.actions`; no route, sidebar, palette or top contribution.
- **Two-composer ownership:** no eager RPC from either instance; click the second to obtain its exact foreign profile descriptor and 60% budget; keyboard-activate the first for its ambient owner and 36% budget; return to the second with Space. No wrong-session model/budget appears.
- Escape dismissal/focus return and outside dismissal. Forced owner dismissal does not steal focus back from the newly activated composer.
- Pending first-session result arriving after second-session activation cannot paint the new popup. Owner/profile/session changes close instead of silently retargeting. Reconnect with identical labels rejects the prior gateway’s result until deliberate reopen.
- Session-specific busy suppression; unrelated conversation busy state neither hides nor refetches the current owner.
- Missing/ambiguous owner routes and missing ownership metadata fail closed, without an ambient fallback. Fresh conversation has an explicit empty state.
- Overall occupancy/free conservation and proportional/bounded 100-cell rounding; independent estimates, provenance, malformed/unsafe numbers, unknown/overbudget values, zero conversation, Unicode and absent arrays.
- Loading, redacted errors, exactly two transient retries, compatibility error without retries, zero-window rebuild and explicit recovery. No stale snapshot during refresh/failure.
- Only metadata projection; raw bodies and supplied CSS colors are ignored, text is escaped, only `session.context_breakdown({session_id})` is allowed by the host adapter.
- Completion/compression/reclaim invalidation while open, foreign-session filtering, no event observers while closed and event/atom cleanup on disposal.

Parent review added a failing cross-connection regression using the public gateway event's `connectionId` field: a foreign source with an identical runtime ID wrongly triggered a refresh. The production filter now uses the real SDK field; the test preserves the no-invalidation assertion for that foreign source.

A browser regression initially exposed Radix’s close autofocus stealing focus back from the old conversation during a two-composer switch. The production `onCloseAutoFocus` now suppresses return only when the captured identity has changed; normal Escape still returns to the original trigger. A narrow screenshot initially captured an internally scrolled panel; exports now reset scrolling and use the lower composer at narrow widths so the summary and synthetic disclosure remain visible.

## Visual evidence

`docs/screenshots/harness-{light,dark}-{1280,390}.png` show actual plugin output in synthetic conversation composers. They are visibly marked **SYNTHETIC SDK HARNESS · PUBLIC DEMO DATA · NOT LIVE DESKTOP**. The narrow/wide light/dark images retain the normal 900px viewport rather than enlarging a full-page dashboard. Popovers are viewport-bounded and internally scrollable when disclosures expand; browser assertions check panel bounds and horizontal containment.

Theme values/formulas come from the inspected runtime and are attributed in `tests/harness-theme.css` / `LICENSE`; native Button styling remains a disclosed approximation. `.local/browser-visual-checks.json` records sampled secondary-text contrast above 4.5:1 in both themes. This is not exhaustive WCAG or native-theme parity proof. `.local/browser-console.json` is empty for the passing run. Wide dark and narrow light screenshots were visually inspected for composer placement, readable hierarchy and clipping.

## Not established / not performed

- No live Desktop loader, actual native Button/wrapper styles, real connected gateway, or alternate/HUD layout qualification.
- No installed app-root copy, enablement, hot reload, app restart, permissions/config changes, or native screenshots.
- No GitHub CI execution, source publication, catalog change, commit or push.

Before claiming native installation, the owner should read back the installed entry, enable through the native Plugins UI, and activate Context by pointer/keyboard in two real conversation tiles with distinct owners/budgets. Check switching while a request is pending, disconnect/reconnect, Escape focus return and disabling teardown. Do not restart an active session solely to obtain a screenshot. Parent review, installation and any external publication remain separate authorized steps.
