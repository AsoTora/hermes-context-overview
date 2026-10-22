import * as sdk from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const { host, useValue, useQuery, atom, Button, Popover, PopoverTrigger, PopoverContent } = sdk
const ID = 'hermes-context-overview'
const epochs = atom(0)
const gateways = new WeakMap()
let gatewaySequence = 0
const number = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
const text = (value, fallback = '') => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 500) : fallback
const fmt = value => value === null ? 'Unknown' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
// Payload counts are safe integers. Round their exact ratio, not a floating tie.
const roundedRatio = (value, max, scale) => (BigInt(value) * BigInt(scale) * 2n + BigInt(max)) / (BigInt(max) * 2n)
const percentage = (value, max) => {
  if (!(max > 0) || value === null) return '—'
  const tenths = roundedRatio(value, max, 1000)
  return `${tenths / 10n}.${tenths % 10n}%`
}
const categoryTokens = { system_prompt: 'system', tool_definitions: 'tools', rules: 'rules', skills: 'skills', mcp: 'mcp', subagent_definitions: 'subagents', memory: 'memory', conversation: 'conversation' }
const color = id => categoryTokens[id] ? `var(--co-${categoryTokens[id]})` : 'var(--co-muted)'

export function normalize(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('missing-data')
  const max = number(payload.context_max)
  const used = number(payload.context_used)
  const issues = []
  const categories = (Array.isArray(payload.categories) ? payload.categories : []).flatMap((row, index) => {
    if (!row || typeof row !== 'object' || number(row.tokens) === null) { issues.push('Malformed category rows were omitted.'); return [] }
    return [{ key: index, id: text(row.id, 'unknown'), label: text(row.label, text(row.id, 'Unknown category')) || 'Unknown category', tokens: row.tokens }]
  })
  let sum = categories.length ? categories.reduce((total, row) => total + row.tokens, 0) : null
  if (sum !== null && !Number.isSafeInteger(sum)) { sum = null; issues.push('Category sum is outside the supported numeric range.') }
  const estimate = number(payload.estimated_total)
  if (estimate !== null && sum !== null && estimate !== sum) issues.push('Reported estimate total differs from the available category rows; neither was rescaled.')
  if (max === null || used === null) issues.push('Invalid occupancy values; budget is unknown.')
  if (max === 0) issues.push('No model window is available yet. The runtime may be rebuilding.')
  const files = (Array.isArray(payload.context_files) ? payload.context_files : []).flatMap(row => row && typeof row === 'object' ? [{ label: text(row.label, 'Context file'), path: text(row.path), chars: number(row.chars), tokens: number(row.est_tokens), loaded: row.loaded === true ? 'Loaded' : row.loaded === false ? 'Not loaded' : 'Unknown', status: text(row.status, 'unknown') }] : [])
  const source = ['provider_usage', 'provider_usage_plus_estimate', 'local_estimate'].includes(payload.context_source) ? payload.context_source : 'unknown'
  const sourceLabel = { provider_usage: 'Provider-reported occupancy', provider_usage_plus_estimate: 'Provider usage + estimated delta', local_estimate: 'Local estimated occupancy', unknown: 'Unknown occupancy provenance' }[source]
  if (source === 'unknown') issues.push('The gateway did not identify occupancy provenance.')
  const known = max > 0 && used !== null
  // Independent estimates are not occupancy. Compare without coercion or rescaling.
  const totals = [sum, estimate].filter(value => value !== null)
  const overflow = max > 0 && (categories.some(row => row.tokens > max) || totals.some(value => value > max) || (categories.length > 0 && sum === null))
  // A conservative display heuristic, not a diagnosis: >=2x and >=10% of window.
  const severe = known && totals.some(value => {
    const high = BigInt(Math.max(value, used)), low = BigInt(Math.min(value, used))
    return high > low && high >= low * 2n && (high - low) * 10n >= BigInt(max)
  })
  const allocationWarning = overflow ? 'overflow' : severe ? 'mismatch' : null
  const free = known ? Math.max(0, max - used) : null
  const occupiedCells = known ? Math.min(100, Number(roundedRatio(used, max, 100))) : 0
  return { max, used, free, known, occupiedCells, categories, files, sum, estimate, allocationWarning, source, sourceLabel, estimated: source !== 'provider_usage' || payload.context_estimated === true, model: text(payload.model, 'Unknown model') || 'Unknown model', issues: [...new Set(issues)], excess: known ? Math.max(0, used - max) : 0 }
}

function gatewayKey() {
  const gateway = host.getGateway?.()
  if (!gateway || typeof gateway !== 'object') return 'legacy'
  if (!gateways.has(gateway)) gateways.set(gateway, ++gatewaySequence)
  return gateways.get(gateway)
}
function snapshot() {
  const state = host.state
  const session = state.focusedSessionId?.get()
  const profile = state.profile.get()
  const connection = state.connectionId?.get() ?? 'legacy'
  const owner = state.focusedSessionOwner?.get()
  const focusedProfile = owner?.profile ?? state.focusedSessionProfile?.get() ?? profile
  return { session, profile, connection, owner, focusedProfile, gateway: state.gateway.get(), instance: gatewayKey(), epoch: epochs.get() }
}
const stamp = value => JSON.stringify([value.connection, value.profile, value.owner?.connectionId, value.focusedProfile, value.session, value.gateway, value.instance, value.epoch])
const ownerKnown = scope => Boolean(host.state.focusedSessionId && host.state.focusedSessionOwner && typeof scope.owner?.connectionId === 'string' && scope.owner.connectionId && typeof scope.owner?.profile === 'string' && scope.owner.profile)
async function routeFor(scope) {
  if (!ownerKnown(scope)) return { blocked: 'Session ownership is unresolved. A Desktop SDK with focused session ownership is required.' }
  const connectionId = scope.owner.connectionId
  if (connectionId === scope.connection && scope.focusedProfile === scope.profile) return { ambient: true }
  let routes
  try { routes = await host.profileRoutes?.() } catch { return { blocked: 'Connection/profile route discovery failed. Retry after the owning connection is available.' } }
  if (!Array.isArray(routes)) return { blocked: 'Connection/profile route discovery is unavailable.' }
  const matches = routes.filter(route => route.connectionId === connectionId && (route.profile === scope.focusedProfile || route.targetProfile === scope.focusedProfile))
  if (matches.length === 1 && typeof host.requestProfile === 'function') return { route: matches[0] }
  return { blocked: 'The focused session has no unique connection/profile route. Return to its owning profile to view context.' }
}

function Budget({ value }) {
  return jsxs('section', { 'aria-label': 'Context budget', children: [
    jsxs('p', { className: 'co-summary', children: [jsx('strong', { children: `${value.estimated ? '≈ ' : ''}${fmt(value.used)} / ${value.max > 0 ? fmt(value.max) : 'Unknown'}` }), ` tokens · ${percentage(value.used, value.max)}`] }),
    jsx('p', { className: 'co-muted', children: `${fmt(value.free)} free · ${value.model} · ${value.sourceLabel}` }),
    jsx('div', { className: 'co-grid', role: 'img', 'aria-label': value.known ? `${fmt(value.used)} of ${fmt(value.max)} tokens occupied; ${fmt(value.free)} free. 100 cells rounded to nearest percent.` : '100 cells: budget unknown, not free.', children: Array.from({ length: 100 }, (_, index) => jsx('span', { 'aria-hidden': true, 'data-cell': !value.known ? 'unknown' : index < value.occupiedCells ? 'occupied' : 'free', className: !value.known ? 'co-cell co-unknown' : index < value.occupiedCells ? 'co-cell co-occupied' : 'co-cell' }, index)) }),
    jsx('p', { className: 'co-muted', children: '■ Occupied · □ Free · ▨ Unknown · 1 cell ≈ 1% (rounded)' }),
    value.excess > 0 && jsx('p', { role: 'alert', children: `Over budget by ${fmt(value.excess)} tokens. Grid capped at 100%.` })
  ] })
}
function Details({ value }) {
  return jsxs('div', { children: [
    jsx(Budget, { value }),
    value.allocationWarning && jsxs('section', { role: 'alert', 'aria-label': 'Allocation reliability warning', children: [
      jsx('strong', { children: value.allocationWarning === 'overflow' ? 'Category estimates exceed the model window' : 'Category estimates disagree substantially with occupancy' }),
      jsx('p', { children: 'Breakdown may be unreliable; it is not extra occupied context. Some gateways count compressed ancestors instead of the current conversation.' }),
      jsx('p', { children: 'Affected gateways require a Hermes backend update with the context-lineage fix. A fixed version is not yet confirmed; this plugin cannot correct backend counts.' })
    ] }),
    jsxs('h3', { children: [jsx('span', { children: 'Estimated allocation' }), ' · % of window'] }),
    value.categories.length ? jsx('ul', { className: 'co-categories', 'aria-label': 'Context categories', children: value.categories.map(row => jsxs('li', { children: [jsxs('span', { className: 'co-category', children: [jsx('span', { className: 'co-swatch', style: { background: color(row.id) }, 'aria-hidden': true }), row.label] }), jsx('span', { children: `≈ ${fmt(row.tokens)} · ${percentage(row.tokens, value.max)}` })] }, row.key)) }) : jsx('p', { children: 'No category estimates are available yet. A resumed or rebuilding session may not have a breakdown.' }),
    jsxs('details', { children: [jsx('summary', { children: 'How estimates differ' }), jsx('p', { className: 'co-muted', children: `Category sum: ${fmt(value.sum)} · Reported estimate: ${fmt(value.estimate)}. Category estimates are independent of overall occupancy and never rescaled to match it. Optional categories may be absent.` }), value.known && value.sum !== null && value.sum !== value.used && jsx('p', { className: 'co-muted', children: `Estimates differ from overall occupancy by ${fmt(Math.abs(value.sum - value.used))} tokens (${value.sum > value.used ? 'higher' : 'lower'}). Differences can reflect estimation, snapshot timing or a backend counting defect; they are not additional budget.` })] }),
    jsxs('details', { children: [jsx('summary', { children: 'Context files · metadata only' }), jsx('p', { className: 'co-muted', children: 'Load status and size only. Files are not opened; estimates are not added again.' }), value.files.length ? jsx('ul', { className: 'co-files', children: value.files.map((file, index) => jsxs('li', { children: [jsx('strong', { children: file.label }), jsx('code', { children: file.path || 'No path supplied' }), jsx('p', { className: 'co-muted', children: `${file.loaded} · ${file.status} · ${fmt(file.chars)} chars · ≈ ${fmt(file.tokens)} tokens` })] }, index)) }) : jsx('p', { children: 'No context-file metadata was supplied.' })] }),
    value.issues.length > 0 && jsxs('details', { children: [jsx('summary', { children: 'Data quality notes' }), jsx('ul', { children: value.issues.map(issue => jsx('li', { children: issue }, issue)) })] })
  ] })
}
function sessionBusy(scope) {
  const map = host.state.busyBySession?.get()
  // The focused fallback is safe ONLY while the captured owner still matches.
  return map && Object.hasOwn(map, scope.session) ? map[scope.session] === true : host.state.busy.get()
}
function ContextPanel({ scope }) {
  useValue(host.state.busyBySession ?? host.state.busy)
  useValue(host.state.busy)
  const [revision, setRevision] = useState(0)
  const identity = stamp(scope)
  const busy = sessionBusy(scope)
  const ownershipMissing = !ownerKnown(scope)
  const valid = () => identity === stamp(snapshot())
  const enabled = Boolean(valid() && scope.session && scope.gateway === 'open' && !ownershipMissing)
  const query = useQuery({
    queryKey: [ID, identity, revision], enabled,
    queryFn: async ({ signal }) => {
      if (signal.aborted || !valid()) throw new Error('scope-changed')
      // Resolve again at dispatch: a disconnected profile descriptor is not authority.
      const target = await routeFor(scope)
      // Route discovery is asynchronous; no captured owner may dispatch after it changes.
      if (signal.aborted || !valid()) throw new Error('scope-changed')
      if (target.blocked) throw Object.assign(new Error(target.blocked), { code: 'route-unavailable' })
      const params = { session_id: scope.session }
      const payload = target.ambient ? await host.request('session.context_breakdown', params, 15000) : await host.requestProfile(target.route, 'session.context_breakdown', params, 15000)
      if (signal.aborted || !valid()) throw new Error('scope-changed')
      const value = normalize(payload)
      if (!value.max) throw new Error('missing-window')
      return value
    },
    staleTime: 15000, gcTime: 0,
    retry: (count, error) => valid() && count < 2 && error?.message !== 'scope-changed' && !['route-unavailable', -32601, 4004].includes(error?.code) && !/method.*(not found|unknown)|unknown method/i.test(error?.message ?? ''),
    retryDelay: count => [1000, 4000][Math.min(count, 1)],
    refetchInterval: query => query.state.status === 'error' ? false : 60000,
    refetchIntervalInBackground: false, refetchOnWindowFocus: false, placeholderData: undefined
  })
  useEffect(() => {
    if (!enabled) return
    return host.onEvent('*', event => {
      const payload = event?.payload ?? {}
      const session = event?.session_id ?? payload.session_id
      if (!valid() || session !== scope.session) return
      // Events with explicit foreign provenance must not invalidate this snapshot.
      if (event.connectionId && event.connectionId !== scope.owner?.connectionId) return
      if (event.profile && event.profile !== scope.focusedProfile) return
      if (event.type === 'session.reclaimed' || event.type === 'message.complete' || (event.type === 'status.update' && ['compacting', 'compressing', 'compacted', 'ready'].includes(payload.kind))) setRevision(value => value + 1)
    })
  }, [enabled, identity])
  const refresh = () => { if (valid()) setRevision(value => value + 1) }
  let message = null
  if (!scope.session) message = 'No session yet. Send a message in this conversation first.'
  else if (scope.gateway !== 'open') message = 'Gateway disconnected. Reopen Context after reconnecting.'
  else if (ownershipMissing) message = 'Session ownership is unresolved. A Desktop SDK with focused session ownership is required.'
  else if (query.isFetching || query.isPending) message = 'Loading context breakdown…'
  if (!message && query.isError) message = query.error?.code === 'route-unavailable' ? query.error.message : query.error?.message === 'missing-window' ? 'No model window is available yet. Bounded retries finished; refresh after the runtime is ready.' : [-32601, 4004].includes(query.error?.code) || /method.*(not found|unknown)|unknown method/i.test(query.error?.message ?? '') ? 'Context breakdown is unavailable on this gateway. Hermes ≥0.22.2 with session.context_breakdown is required.' : 'Context could not be refreshed. No previous snapshot is shown. Check the gateway and retry.'
  return jsxs('div', { children: [
    jsxs('header', { className: 'co-header', children: [jsx('h2', { children: 'Conversation context' }), jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', disabled: !enabled || query.isFetching, onClick: refresh, children: 'Refresh context' })] }),
    jsx('code', { className: 'co-muted', children: `${text(scope.focusedProfile)} · ${text(scope.session, 'New conversation')}` }),
    busy && jsx('p', { className: 'co-muted', role: 'status', children: 'Turn in progress — latest available snapshot; usage may lag until completion.' }),
    message ? jsx('p', { role: query.isError ? 'alert' : 'status', children: message }) : query.data && jsx(Details, { value: query.data }),
    jsx('p', { className: 'co-muted', children: 'Read-only · updates only while open · no prompt/message bodies' })
  ] })
}

export function ContextControl() {
  useValue(host.state.focusedSessionId ?? host.state.activeSessionId)
  useValue(host.state.profile)
  useValue(host.state.connectionId ?? host.state.profile)
  useValue(host.state.focusedSessionOwner ?? host.state.profile)
  useValue(host.state.gateway)
  useValue(epochs)
  const [scope, setScope] = useState(null)
  const activation = useRef(null)
  const current = stamp(snapshot())
  const valid = Boolean(scope && stamp(scope) === current)
  useEffect(() => { if (scope && !valid) setScope(null) }, [current, valid, scope])
  // The status bar preserves the public focused owner; it never selects a composer.
  const arm = () => { activation.current = snapshot() }
  const openChange = open => {
    if (!open) { setScope(null); activation.current = null; return }
    const captured = activation.current
    if (captured && stamp(captured) === stamp(snapshot())) setScope(captured)
  }
  return jsxs(Popover, { open: valid, onOpenChange: openChange, children: [
    jsx(PopoverTrigger, { asChild: true, children: jsxs(Button, { type: 'button', variant: 'ghost', size: 'sm', style: { height: '100%', padding: '0 6px', border: 0, borderRadius: 0, fontSize: 11, color: 'var(--ui-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }, onPointerDown: arm, onFocus: arm, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') arm() }, children: [jsxs('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false', style: { flexShrink: 0 }, children: [jsx('path', { d: 'M21 12a9 9 0 1 1-9-9v9Z' }), jsx('path', { d: 'M15 3.5A9 9 0 0 1 20.5 9H15Z' })] }), 'Context'] }) }),
    valid && jsxs(PopoverContent, { side: 'top', align: 'end', collisionPadding: 8, className: 'hermes-context-overview', 'aria-label': 'Conversation context', onCloseAutoFocus: event => { if (stamp(scope) !== stamp(snapshot())) event.preventDefault() }, children: [jsx('style', { children: styles }), jsx(ContextPanel, { scope }, stamp(scope))] })
  ] })
}

// Plugin-local roles follow native tokens, including live theme/accent changes.
// Small secondary text uses near-primary ink: some native skins deliberately
// have low-contrast secondary text. Hierarchy comes from size and spacing.
const styles = `
.hermes-context-overview{
 --co-surface:var(--ui-bg-elevated);
 --co-muted:var(--ui-text-primary);
 --co-line:color-mix(in srgb,var(--ui-base) 14%,var(--co-surface));
 --co-cell-edge:color-mix(in srgb,var(--ui-base) 50%,var(--co-surface));
 --co-free:color-mix(in srgb,var(--ui-base) 4%,var(--co-surface));
 --co-occupied:color-mix(in srgb,var(--ui-accent) 72%,var(--ui-base));
 --co-system:color-mix(in srgb,var(--context-usage-system) 78%,var(--ui-base));
 --co-tools:color-mix(in srgb,var(--context-usage-tools) 78%,var(--ui-base));
 --co-rules:color-mix(in srgb,var(--context-usage-rules) 78%,var(--ui-base));
 --co-skills:color-mix(in srgb,var(--context-usage-skills) 78%,var(--ui-base));
 --co-mcp:color-mix(in srgb,var(--context-usage-mcp) 78%,var(--ui-base));
 --co-subagents:color-mix(in srgb,var(--context-usage-subagents) 78%,var(--ui-base));
 --co-memory:color-mix(in srgb,var(--context-usage-memory) 78%,var(--ui-base));
 --co-conversation:color-mix(in srgb,var(--context-usage-conversation) 78%,var(--ui-base));
 box-sizing:border-box;width:min(380px,calc(100vw - 24px));max-height:min(660px,var(--radix-popover-content-available-height,75vh));overflow:auto;overscroll-behavior:contain;padding:14px;color:var(--ui-text-primary);background:var(--co-surface);border:1px solid var(--co-line);border-radius:12px;box-shadow:0 8px 28px color-mix(in srgb,var(--ui-base) 12%,transparent);font-size:12px;line-height:1.5
}
.hermes-context-overview *{box-sizing:border-box}
.hermes-context-overview h2{font-size:14px;font-weight:600;letter-spacing:-.015em;margin:0}
.hermes-context-overview h3{font-size:11px;font-weight:600;margin:16px 0 6px}
.hermes-context-overview p{margin:7px 0}
.hermes-context-overview code{display:block;overflow-wrap:anywhere;white-space:normal;font-size:11px}
.hermes-context-overview .co-header{display:flex;gap:8px;align-items:center;justify-content:space-between}
.hermes-context-overview .co-header button{height:auto;padding:5px 7px;font-size:11px;color:var(--co-muted);border:1px solid var(--co-line);border-radius:6px;background:transparent;white-space:nowrap}
.hermes-context-overview .co-header button:hover{background:var(--co-free)}
.hermes-context-overview .co-muted{color:var(--co-muted);font-size:11px}
.hermes-context-overview .co-summary{margin-top:16px;font-variant-numeric:tabular-nums}
.hermes-context-overview .co-summary strong{font-size:17px;font-weight:600;letter-spacing:-.025em}
.hermes-context-overview .co-grid{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:3px;margin:12px 0}
.hermes-context-overview .co-cell{height:9px;border:1px solid var(--co-cell-edge);border-radius:2px;background:var(--co-free)}
.hermes-context-overview .co-occupied{background:var(--co-occupied);border-color:var(--co-occupied)}
.hermes-context-overview .co-unknown{background:repeating-linear-gradient(135deg,var(--co-free),var(--co-free) 3px,var(--co-cell-edge) 3px,var(--co-cell-edge) 5px)}
.hermes-context-overview .co-categories{list-style:none;margin:0;padding:0}
.hermes-context-overview .co-categories li{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--co-line);padding:5px 0;font-variant-numeric:tabular-nums}
.hermes-context-overview .co-categories li:last-child{border-bottom:0}
.hermes-context-overview .co-categories li>span:last-child{white-space:nowrap;flex-shrink:0;font-size:11px}
.hermes-context-overview .co-category{display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere}
.hermes-context-overview .co-swatch{width:8px;height:8px;border-radius:2px;flex:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ui-base) 16%,transparent)}
.hermes-context-overview details{border-top:1px solid var(--co-line);padding-top:8px;margin-top:10px}
.hermes-context-overview summary{cursor:pointer;color:var(--co-muted);font-size:11px}
.hermes-context-overview .co-files{padding-left:16px}
.hermes-context-overview :focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
`

export default {
  id: ID, name: 'Context Overview', defaultEnabled: true,
  register(ctx) {
    for (const state of [host.state.connectionId, host.state.profile, host.state.gateway]) {
      if (state?.listen) ctx.onDispose(state.listen(() => epochs.set(epochs.get() + 1)))
    }
    ctx.register({ id: 'context', area: 'statusBar.right', render: () => jsx(ContextControl, {}) })
  }
}
