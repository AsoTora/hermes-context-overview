# Verification boundary — 1.2.1

## Results

The production ESM contribution is covered by **33 tests: 25 Chromium browser-harness tests plus 8 entry/normalization/privacy tests**, and **10 Python stdlib release tests**. These use real React, React Query and Radix UI **1.6.7**, matching the inspected Desktop dependency. SDK atoms/async routing/RPC/events, contribution registry, native Button/wrapper styling and host focus routing are explicit synthetic seams. This is source/browser verification, not a live Desktop installation. Final exit codes and candidate hashes are retained in the local receipt rather than inferred from this document.

| Command | Result | Retained evidence |
| --- | --- | --- |
| `pnpm gate` | canonical syntax/contract, 33 JS + 10 release tests, packaging and verification | `.local/evidence/final-gate.log` |
| `hermes plugins doctor --ci .` | **exit 1**, known Desktop-only tooling limitation | `.local/evidence/final-doctor.log` |
| `hermes plugins validate . --install-deps` | exit 0; SDK surface valid; security scan safe; Python capability probe skipped | `.local/evidence/final-validate.log` |

`node scripts/verify.mjs` preserves command output and writes `.local/evidence/evidence.json` with command exit codes, log SHA-256 values and a sorted candidate file/size/SHA-256 inventory, excluding `dist/`, caches and evidence itself. The script exits 1 while doctor fails; it never turns that failure into a passing check. Local validation reuses the original checkout’s existing Playwright browser cache through `PLAYWRIGHT_BROWSERS_PATH`; dev dependencies are installed only in this isolated worktree using frozen offline pnpm. No Hermes dependencies or browsers are installed into the runtime checkout. Hosted CI and tag publication remain separate from local receipts.

The doctor tries Python registration and fails `No __init__.py` for this Desktop-only package. The native-aware validator accepts `desktop/plugin.js`, skips Python capability probing, reports portable/no Python and passes. No dummy Python shim was added. Doctor coverage is unavailable, not a native renderer failure or a passing gate.

## Public status-bar surface and focused ownership

Inspected runtime reference: `d923a5eb487a17c0a68801bba9ef0f56c81040a8`. Relevant files under `apps/desktop/src/`:

- `app/contrib/panes.tsx:155–185`: `useStatusbarContributions('right')` accepts `statusBar.right` contributions with `render()`, preserving a stateful component in the bottom bar.
- `app/shell/statusbar-controls.tsx:28–31,46–51`: native compact status-bar action styling and arbitrary render-item ownership. The plugin uses the SDK Button with compact 11px text, 6px horizontal padding and full slot height; no native indicator is replaced.
- `sdk/index.ts:1478–1496`: `host.profileRoutes()` is **asynchronous**. The query awaits discovery and checks captured authority again before dispatch, instead of filtering a Promise during render.
- `components/pane-shell/tree/renderer/index.tsx:38–45`: the tree root installs `trackActiveTreeGroup`.
- `components/pane-shell/tree/store.ts:542–578`: the host resolves the event’s owning tree group and publishes it from **window capture listeners** for `pointerdown` and `focusin`.
- `store/session-focus.ts:46–92`: interacted group / active chat pane derives focused stored session identity; SDK `host.state.focusedSessionId` / `focusedSessionOwner` expose runtime identity and connection-qualified ownership.
- `components/ui/popover.tsx`: native SDK Popover delegates to Radix, portals the content and forwards normal focus/dismissal props. `apps/desktop/package.json` pins `radix-ui` at 1.6.7.

The host selects the focused conversation before status-bar activation. The single plugin button captures that public identity and never selects a composer or retargets an open popup. A closed button issues no requests or route discovery. The plugin neither reads private DOM markers nor installs global handlers.

**Emulated host seam:** `tests/harness.mjs` renders two conversation sections with ordinary composers and exactly one actual contribution in a bottom `footer`. A separate synthetic existing button is explicitly labelled `prompt-cache hit-rate 98%`, beside synthetic t/s and RAM. Its markup and behavior remain unchanged through Context interactions. The harness window-capture pointer/focus handler selects a conversation only for interactions inside that conversation; status-bar activation preserves the last public owner. It does not mount the real Desktop shell/tree/store.

No composer, page, sidebar, titlebar or palette contribution remains. Existing SDK React Query and Radix Popover behavior is reused without core changes, backend work, collectors or new production dependencies.

### Existing mid-turn RPC contract

The inspected `tui_gateway/methods_session.py:1479–1509` handler copies history under `history_lock` and computes context metadata in the owning session/profile runtime scope; it has no idle-only condition. The default session resolver returns the registered session without requiring an idle turn. `agent/context_breakdown.py:143–208` uses history plus provider-usage/estimate anchors; those anchors and current history may lag an in-flight response. The plugin therefore reuses that same metadata RPC during turns without changing backend/core or initiating inference, and clearly labels the available snapshot rather than claiming per-token precision. This is source inspection, not a live gateway test.

## Covered behavior

- **Actual registration boundary:** only `statusBar.right`, exactly one Context button in the bottom bar; no composer/page/titlebar/sidebar/palette contribution. Separate synthetic 98% cache indicator remains unchanged and does not open Context.
- **Two-conversation ownership:** focus conversation 2 then click bottom Context for its exact foreign descriptor and 60% budget; focus conversation 1 then keyboard-activate the same button for its ambient route and 36% budget; return to conversation 2 with Space. No wrong-session model/budget appears. Status-bar focus does not choose another composer.
- Escape dismissal/focus return and outside dismissal. Forced owner dismissal does not steal focus back from the newly activated composer.
- Pending first-session result arriving after second-session activation cannot paint the new popup. Owner/profile/session changes close instead of silently retargeting. Reconnect with identical labels rejects the prior gateway’s result until deliberate reopen.
- Mid-turn open/manual refresh with visible latest-snapshot lag notice; same-owner pending responses remain usable across busy transitions. Busy is not cache identity or dispatch authority; unrelated conversation busy state neither hides nor refetches the current owner.
- Missing/ambiguous owner routes, rejected async discovery and absent/incomplete ownership metadata fail closed without ambient fallback. Deferred route discovery resolving after owner/session/profile/connection/gateway changes or dismissal dispatches no RPC; becoming busy alone still permits the exact captured-owner dispatch. Discovery rejection is redacted and not retried. Fresh conversations have an explicit empty state.
- Completion/compression refresh remains active during/after turns, with ordinary open-only 60-second polling and no per-token request flood. Closed controls issue no background requests across two simulated 60-second idle intervals, and no eager route discovery occurs.
- Overall occupancy/free conservation and proportional/bounded 100-cell rounding; independent estimates, provenance, malformed/unsafe numbers, unknown/overbudget values, zero conversation, Unicode and absent arrays.
- Loading, redacted errors, exactly two transient retries, compatibility error without retries, zero-window rebuild and explicit recovery. No stale snapshot during refresh/failure.
- Only metadata projection; raw bodies and supplied CSS colors are ignored, text is escaped, only `session.context_breakdown({session_id})` is allowed by the host adapter.
- Completion/compression/reclaim invalidation while open, foreign-session filtering, no event observers while closed and event/atom cleanup on disposal.

The existing cross-connection regression uses the public gateway event's `connectionId` field: a foreign source with an identical runtime ID must not trigger refresh. This isolation remains covered.

`onCloseAutoFocus` suppresses focus return only when captured identity changes; normal Escape returns to the bottom trigger. Forced owner changes do not steal focus from the newly focused conversation. Click-to-toggle and outside dismissal are exercised. Screenshots reset internal scrolling; the synthetic shell adapts to the banner wrapping at narrow widths so the bottom bar stays within the viewport.

## Visual evidence

The trigger includes actual inline SVG markup (two paths, 12×12, `currentColor`, `aria-hidden`, nonfocusable). Browser assertions verify it while retaining exact accessible name Context, native trigger keyboard behavior and unchanged separate cache markup. Narrow screenshots include a running-turn lag notice alongside the breakdown.

`docs/screenshots/harness-{light,dark}-{1280,390}.png` show actual plugin output anchored to a synthetic bottom status-bar button, not either composer. They are visibly marked **SYNTHETIC SDK HARNESS · PUBLIC DEMO DATA · NOT LIVE DESKTOP**. The narrow/wide light/dark images retain the normal 900px viewport rather than enlarging a full-page dashboard. Popovers are viewport-bounded and internally scrollable when disclosures expand; browser assertions check panel bounds and horizontal containment.

Theme values/formulas come from the inspected runtime and are attributed in `tests/harness-theme.css` / `LICENSE`; native Button styling remains a disclosed approximation. `.local/browser-visual-checks.json` records sampled secondary-text contrast above 4.5:1 in both themes. This is not exhaustive WCAG or native-theme parity proof. `.local/browser-console.json` is empty for the passing run. Wide dark and narrow light screenshots were visually inspected for bottom placement, the separate cache indicator, readable hierarchy and clipping.

## Not established / not performed

- No live Desktop loader, actual native Button/wrapper styles, real connected gateway, or alternate/HUD layout qualification.
- No installed app-root copy, enablement, hot reload, app restart, permissions/config changes, or native screenshots.
- No GitHub CI execution, source publication, catalog change, commit or push.

Before claiming native installation, the owner should read back the installed entry, enable through the native Plugins UI, and focus each of two real conversation tiles with distinct owners/budgets, then activate the same bottom Context button by pointer/keyboard. Confirm the native cache/t/s/RAM indicators are unchanged. Check switching while a request is pending, disconnect/reconnect, Escape focus return and disabling teardown. Do not restart an active session solely to obtain a screenshot. Parent review, installation and any external publication remain separate authorized steps.
