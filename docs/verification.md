# Verification boundary — 1.2.5

## Verification scope

The production ESM contribution is covered by **41 JS tests: 28 Chromium behavior tests, 12 entry/normalization/privacy tests and one all-theme Chromium test**, plus **11 Python stdlib release tests**. They use real React, React Query and Radix UI **1.6.7**, matching the inspected Desktop dependency. SDK atoms/async routing/RPC/events, contribution registry, native Button/wrapper styling and host focus routing remain explicit synthetic seams. This is source/browser verification, not a live Desktop installation.

`pnpm gate` checks syntax, version/changelog consistency, JS and release tests, deterministic packaging and exact artifact content/checksums. The theme test covers all 12 built-ins / 24 native palettes at wide and narrow widths, computed text contrast, visible cells/swatches, overflow, default footer clipping and switching palettes without extra context requests. Release tests independently extract the archive and verify the four explicitly allowlisted public screenshots, reject missing images and exclude unlisted images. See [approved theme evidence and limits](theme-review.md).

Native tooling is separate from that portable gate:

- `hermes plugins validate . --install-deps` validates the package/SDK surface and security scan, skipping Python capability probing for this Desktop-only package. It does not load a native renderer.
- `hermes plugins doctor --ci .` has a known `No __init__.py` limitation: it tries Python registration for this Desktop-only package. Its failure must remain reported separately, not hidden with a dummy Python shim or represented as a passing gate.

`node scripts/verify.mjs` preserves ignored local command output and a sorted candidate hash inventory. It exits nonzero while doctor fails. Exact execution receipts belong in local evidence, not release assets. Hosted CI, publication, installation and native Desktop verification are separate checks; this document does not claim them.

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

### Allocation reliability regression

A public synthetic fixture models 121,137 provider-occupancy tokens in a 500,000-token window with a 786,899-token conversation estimate and an 810,000 category sum. These are demo magnitudes, not a session export or a corrected estimate. Tests preserve 24 occupied cells, 378,863 free tokens, raw category counts and provider provenance. Overflow is checked independently for rows, sum and reported estimate, even with unknown occupancy or unsafe sums. Severe mismatch uses an exact ≥2× ratio and ≥10% window-difference floor; both directions and zero boundaries are covered. Ordinary disagreement is explained without categorically dismissing it as drift.

Chromium verifies the warning is visible without disclosure expansion or scrolling at 1280px and 390px, model-window percentage labelling, unscaled >100% category shares and warning removal after a clean refresh. The plugin does not patch Hermes core: expanded-ancestor counting requires the backend context-lineage fix, whose released version is not confirmed. Exact integer ratio regression covers decimal and grid half ties.

## Visual evidence

The trigger includes actual inline SVG markup (two paths, 12×12, `currentColor`, `aria-hidden`, nonfocusable). Browser assertions verify it while retaining exact accessible name Context, native trigger keyboard behavior and unchanged separate cache markup. Narrow screenshots include a running-turn lag notice alongside the breakdown.

Browser-test captures (`.local/browser/screenshots/harness-{light,dark}-{1280,390}.png`) show actual plugin output anchored to the harness bottom status-bar button, not either composer, at the normal 900px viewport. The public README images are generated separately by `pnpm screenshots:docs` with demo data. Popovers are viewport-bounded and internally scrollable when disclosures expand; browser assertions check panel bounds and horizontal containment.

Theme values/formulas come from the inspected runtime and are attributed in `tests/harness-theme.css` / `LICENSE`; native Button styling remains a disclosed approximation. The historical browser checks sampled secondary-text contrast above 4.5:1 in both themes. Current all-theme coverage and approved contact sheets are described in [theme review](theme-review.md). Neither is exhaustive WCAG certification or live native-renderer proof.

## Not established / not performed

- No live Desktop loader, actual native Button/wrapper styles, real connected gateway, or alternate/HUD layout qualification.
- No installed app-root copy, enablement, hot reload, app restart, permissions/config changes, or native screenshots.
- No GitHub CI execution, source publication, catalog change or push. A local candidate commit is not publication.

Before claiming native installation, the owner should read back the installed entry, enable through the native Plugins UI, and focus each of two real conversation tiles with distinct owners/budgets, then activate the same bottom Context button by pointer/keyboard. Confirm the native cache/t/s/RAM indicators are unchanged. Check switching while a request is pending, disconnect/reconnect, Escape focus return and disabling teardown. Do not restart an active session solely to obtain a screenshot. Parent review, installation and any external publication remain separate authorized steps.
