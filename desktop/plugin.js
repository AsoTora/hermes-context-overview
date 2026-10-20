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
const percentage = (value, max) => max > 0 && value !== null ? `${(value / max * 100).toFixed(1)}%` : '—'
const categoryTokens = { system_prompt: 'system', tool_definitions: 'tools', rules: 'rules', skills: 'skills', mcp: 'mcp', subagent_definitions: 'subagents', memory: 'memory', conversation: 'conversation' }
const color = id => categoryTokens[id] ? `var(--context-usage-${categoryTokens[id]})` : 'var(--ui-text-secondary)'

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
  const free = known ? Math.max(0, max - used) : null
  const occupiedCells = known ? Math.min(100, Math.round(used / max * 100)) : 0
  return { max, used, free, known, occupiedCells, categories, files, sum, estimate, source, sourceLabel, estimated: source !== 'provider_usage' || payload.context_estimated === true, model: text(payload.model, 'Unknown model') || 'Unknown model', issues: [...new Set(issues)], excess: known ? Math.max(0, used - max) : 0 }
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
function routeFor(scope) {
  if (!host.state.focusedSessionId || !host.state.focusedSessionOwner || !scope.owner) return { blocked: 'Session ownership is unresolved. A Desktop SDK with focused session ownership is required.' }
  const connectionId = scope.owner?.connectionId ?? scope.connection
  if (connectionId === scope.connection && scope.focusedProfile === scope.profile) return { ambient: true }
  const routes = host.profileRoutes?.() ?? []
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
    jsx('h3', { children: 'Estimated allocation' }),
    value.categories.length ? jsx('ul', { className: 'co-categories', 'aria-label': 'Context categories', children: value.categories.map(row => jsxs('li', { children: [jsxs('span', { className: 'co-category', children: [jsx('span', { className: 'co-swatch', style: { background: color(row.id) }, 'aria-hidden': true }), row.label] }), jsx('span', { children: `≈ ${fmt(row.tokens)} · ${percentage(row.tokens, value.max)}` })] }, row.key)) }) : jsx('p', { children: 'No category estimates are available yet. A resumed or rebuilding session may not have a breakdown.' }),
    jsxs('details', { children: [jsx('summary', { children: 'How estimates differ' }), jsx('p', { className: 'co-muted', children: `Category sum: ${fmt(value.sum)} · Reported estimate: ${fmt(value.estimate)}. Category estimates are independent of overall occupancy and never rescaled to match it. Optional categories may be absent.` }), value.known && value.sum !== null && value.sum !== value.used && jsx('p', { className: 'co-muted', children: `Estimates differ from overall occupancy by ${fmt(Math.abs(value.sum - value.used))} tokens (${value.sum > value.used ? 'higher' : 'lower'}). This is estimate drift, not additional budget.` })] }),
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
  const route = routeFor(scope)
  const valid = () => identity === stamp(snapshot())
  const enabled = Boolean(valid() && scope.session && scope.gateway === 'open' && !busy && !route.blocked)
  const query = useQuery({
    queryKey: [ID, identity, busy, revision], enabled,
    queryFn: async ({ signal }) => {
      if (signal.aborted || !valid() || sessionBusy(scope)) throw new Error('scope-changed')
      // Resolve again at dispatch: a disconnected profile descriptor is not authority.
      const target = routeFor(scope)
      if (target.blocked) throw new Error('scope-changed')
      const params = { session_id: scope.session }
      const payload = target.ambient ? await host.request('session.context_breakdown', params, 15000) : await host.requestProfile(target.route, 'session.context_breakdown', params, 15000)
      if (signal.aborted || !valid() || sessionBusy(scope)) throw new Error('scope-changed')
      const value = normalize(payload)
      if (!value.max) throw new Error('missing-window')
      return value
    },
    staleTime: 15000, gcTime: 0,
    retry: (count, error) => valid() && !sessionBusy(scope) && count < 2 && error?.message !== 'scope-changed' && ![-32601, 4004].includes(error?.code) && !/method.*(not found|unknown)|unknown method/i.test(error?.message ?? ''),
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
  const refresh = () => { if (valid() && !sessionBusy(scope)) setRevision(value => value + 1) }
  let message = null
  if (!scope.session) message = 'No session yet. Send a message in this conversation first.'
  else if (scope.gateway !== 'open') message = 'Gateway disconnected. Reopen Context after reconnecting.'
  else if (route.blocked) message = route.blocked
  else if (busy) message = 'Session is busy. Context will refresh when this turn ends.'
  else if (query.isFetching || query.isPending) message = 'Loading context breakdown…'
  if (!message && query.isError) message = query.error?.message === 'missing-window' ? 'No model window is available yet. Bounded retries finished; refresh after the runtime is ready.' : [-32601, 4004].includes(query.error?.code) || /method.*(not found|unknown)|unknown method/i.test(query.error?.message ?? '') ? 'Context breakdown is unavailable on this gateway. Hermes ≥0.22.2 with session.context_breakdown is required.' : 'Context could not be refreshed. No previous snapshot is shown. Check the gateway and retry.'
  return jsxs('div', { children: [
    jsxs('header', { className: 'co-header', children: [jsx('h2', { children: 'Conversation context' }), jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', disabled: !enabled || query.isFetching, onClick: refresh, children: 'Refresh context' })] }),
    jsx('code', { className: 'co-muted', children: `${text(scope.focusedProfile)} · ${text(scope.session, 'New conversation')}` }),
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
  // Core window capture pointerdown/focusin routes the owning tree group BEFORE
  // these handlers. Never display global usage in each closed composer instance.
  const arm = () => { activation.current = snapshot() }
  const openChange = open => {
    if (!open) { setScope(null); activation.current = null; return }
    const captured = activation.current
    if (captured && stamp(captured) === stamp(snapshot())) setScope(captured)
  }
  return jsxs(Popover, { open: valid, onOpenChange: openChange, children: [
    jsx(PopoverTrigger, { asChild: true, children: jsx(Button, { type: 'button', variant: 'ghost', size: 'sm', onPointerDown: arm, onFocus: arm, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') arm() }, children: 'Context' }) }),
    valid && jsxs(PopoverContent, { side: 'top', align: 'end', collisionPadding: 8, className: 'hermes-context-overview', 'aria-label': 'Conversation context', onCloseAutoFocus: event => { if (stamp(scope) !== stamp(snapshot())) event.preventDefault() }, children: [jsx('style', { children: styles }), jsx(ContextPanel, { scope }, stamp(scope))] })
  ] })
}

const styles = `
.hermes-context-overview{box-sizing:border-box;width:min(380px,calc(100vw - 24px));max-height:min(620px,var(--radix-popover-content-available-height,75vh));overflow:auto;overscroll-behavior:contain;padding:14px;color:var(--ui-text-primary);background:var(--ui-bg-elevated);border:1px solid var(--ui-stroke-secondary);border-radius:10px;font-size:12px;line-height:1.5}
.hermes-context-overview *{box-sizing:border-box}.hermes-context-overview h2{font-size:14px;margin:0}.hermes-context-overview h3{font-size:12px;margin:16px 0 6px}.hermes-context-overview p{margin:8px 0}.hermes-context-overview code{display:block;overflow-wrap:anywhere;white-space:normal;font-size:11px}.hermes-context-overview .co-header{display:flex;gap:12px;align-items:center;justify-content:space-between}.hermes-context-overview .co-muted{color:var(--ui-text-secondary);font-size:11px}.hermes-context-overview .co-summary{margin-top:14px;font-variant-numeric:tabular-nums}.hermes-context-overview .co-summary strong{font-size:16px}.hermes-context-overview .co-grid{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:3px;margin:12px 0}.hermes-context-overview .co-cell{height:9px;border:1px solid var(--ui-stroke-secondary);border-radius:2px;background:var(--ui-editor-surface-background)}.hermes-context-overview .co-occupied{background:var(--ui-accent);border-color:var(--ui-accent)}.hermes-context-overview .co-unknown{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--ui-stroke-secondary) 3px,var(--ui-stroke-secondary) 5px)}.hermes-context-overview .co-categories{list-style:none;margin:0;padding:0}.hermes-context-overview .co-categories li{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--ui-stroke-secondary);padding:5px 0;font-variant-numeric:tabular-nums}.hermes-context-overview .co-category{display:flex;align-items:center;gap:6px;min-width:0;overflow-wrap:anywhere}.hermes-context-overview .co-swatch{width:7px;height:7px;border-radius:2px;flex:none}.hermes-context-overview details{border-top:1px solid var(--ui-stroke-secondary);padding-top:8px;margin-top:10px}.hermes-context-overview summary{cursor:pointer;color:var(--ui-text-secondary)}.hermes-context-overview .co-files{padding-left:16px}.hermes-context-overview :focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
`

export default {
  id: ID, name: 'Context Overview', defaultEnabled: true,
  register(ctx) {
    for (const state of [host.state.connectionId, host.state.profile, host.state.gateway]) {
      if (state?.listen) ctx.onDispose(state.listen(() => epochs.set(epochs.get() + 1)))
    }
    ctx.register({ id: 'context', area: sdk.COMPOSER_AREAS.actions, render: () => jsx(ContextControl, {}) })
  }
}
