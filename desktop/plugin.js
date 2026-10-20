import * as sdk from '@hermes/plugin-sdk'
import { useEffect } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const { host, useValue, useQuery, atom, Button } = sdk
const ID = 'hermes-context-overview'
const PATH = '/context-overview'
const revision = atom(0)
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
  const session = (state.focusedSessionId ?? state.activeSessionId).get()
  const profile = state.profile.get()
  const connection = state.connectionId?.get() ?? 'legacy'
  const owner = state.focusedSessionOwner?.get()
  const focusedProfile = owner?.profile ?? state.focusedSessionProfile?.get() ?? profile
  return { session, profile, connection, owner, focusedProfile, gateway: state.gateway.get(), instance: gatewayKey(), epoch: epochs.get(), revision: revision.get() }
}
const stamp = value => JSON.stringify([value.connection, value.profile, value.owner?.connectionId, value.focusedProfile, value.session, value.gateway, value.instance, value.epoch, value.revision])
function routeFor(scope) {
  if (host.state.focusedSessionOwner && !scope.owner) return { blocked: 'Session ownership is unresolved. Focus a connected conversation and try again.' }
  if (!host.state.focusedSessionOwner) {
    const sources = new Set((host.profileRoutes?.() ?? []).filter(route => route.profile === scope.focusedProfile || route.targetProfile === scope.focusedProfile).map(route => route.connectionId))
    if (sources.size > 1) return { blocked: 'This SDK lacks the session owner metadata required to distinguish multiple connections. Upgrade Hermes Desktop.' }
  }
  const connectionId = scope.owner?.connectionId ?? scope.connection
  if (connectionId === scope.connection && scope.focusedProfile === scope.profile) return { ambient: true }
  const routes = host.profileRoutes?.() ?? []
  const matches = routes.filter(route => route.connectionId === connectionId && (route.profile === scope.focusedProfile || route.targetProfile === scope.focusedProfile))
  if (matches.length === 1 && typeof host.requestProfile === 'function') return { route: matches[0] }
  return { blocked: 'The focused session has no unique connection/profile route. Return to its owning profile to view context.' }
}

function Metric({ label, value, detail }) {
  return jsxs('div', { className: 'co-metric', children: [jsx('div', { className: 'co-muted', children: label }), jsx('strong', { children: value }), jsx('div', { className: 'co-muted', children: detail })] })
}
function Table({ caption, headers, rows }) {
  return jsx('div', { className: 'co-table-wrap', tabIndex: 0, role: 'region', 'aria-label': caption, children: jsxs('table', { children: [jsx('caption', { children: caption }), jsx('thead', { children: jsx('tr', { children: headers.map(header => jsx('th', { scope: 'col', children: header }, header)) }) }), jsx('tbody', { children: rows.map((row, index) => jsx('tr', { children: row.map((cell, column) => jsx(column === 0 ? 'th' : 'td', { scope: column === 0 ? 'row' : undefined, children: cell }, column)) }, index)) })] }) })
}
function Budget({ value }) {
  return jsxs('section', { className: 'co-card', 'aria-label': 'Context budget', children: [
    jsxs('div', { className: 'co-section-title', children: [jsx('h2', { children: 'Model window' }), jsx('span', { className: 'co-muted', children: value.known ? `${percentage(value.used, value.max)} occupied` : 'Budget unknown' })] }),
    jsx('div', { className: 'co-grid', role: 'img', 'aria-label': value.known ? `${fmt(value.used)} of ${fmt(value.max)} tokens occupied; ${fmt(value.free)} free. 100 cells rounded to nearest percent.` : '100 cells: budget unknown, not free.', children: Array.from({ length: 100 }, (_, index) => jsx('span', { 'aria-hidden': true, 'data-cell': !value.known ? 'unknown' : index < value.occupiedCells ? 'occupied' : 'free', className: !value.known ? 'co-cell co-unknown' : index < value.occupiedCells ? 'co-cell co-occupied' : 'co-cell' }, index)) }),
    jsxs('p', { className: 'co-legend', children: [jsx('span', { children: '■ Occupied' }), jsx('span', { children: '□ Free' }), jsx('span', { children: '▨ Unknown' }), jsx('span', { className: 'co-muted', children: '1 cell ≈ 1% of window · rounded' })] }),
    jsx('p', { className: 'co-muted', children: 'This grid shows overall occupancy, not estimated category attribution. Category estimates below are independent and are never stretched to match the provider total.' }),
    value.excess > 0 && jsx('p', { role: 'alert', children: `Over budget by ${fmt(value.excess)} tokens. The grid is capped at 100%; no free budget remains.` })
  ] })
}
function Details({ value }) {
  return jsxs('div', { className: 'co-body', children: [
    jsx('div', { className: 'co-metrics', children: [jsx(Metric, { label: 'Occupied tokens', value: `${value.estimated ? '≈ ' : ''}${fmt(value.used)}`, detail: value.sourceLabel }), jsx(Metric, { label: 'Model capacity', value: value.max > 0 ? fmt(value.max) : 'Unknown', detail: value.model }), jsx(Metric, { label: 'Free budget', value: fmt(value.free), detail: 'Window minus overall occupancy' })] }),
    jsx(Budget, { value }),
    jsx('section', { className: 'co-card', children: jsxs('div', { children: [jsx('h2', { children: 'Estimated allocation' }), jsx('p', { className: 'co-muted', children: `Category sum: ${fmt(value.sum)} tokens · Reported estimate: ${fmt(value.estimate)} tokens. All category counts are approximate, not provider tokenizer measurements.` }),
      value.known && value.sum !== null && value.sum !== value.used && jsx('p', { className: 'co-note', children: `Estimates differ from overall occupancy by ${fmt(Math.abs(value.sum - value.used))} tokens (${value.sum > value.used ? 'higher' : 'lower'}). This is estimate drift, not additional free or used budget.` }),
      value.categories.length ? jsx(Table, { caption: 'Context categories', headers: ['Category', 'Estimated tokens', '% of model window'], rows: value.categories.map(row => [jsxs('span', { className: 'co-category', children: [jsx('span', { className: 'co-swatch', style: { background: color(row.id) }, 'aria-hidden': true }), row.label] }), `≈ ${fmt(row.tokens)}`, percentage(row.tokens, value.max)]) }) : jsx('p', { children: 'No category estimates are available yet. A resumed or rebuilding session can report occupancy before an agent breakdown exists.' }),
      jsx('p', { className: 'co-muted', children: 'Optional categories may be absent. The RPC reports aggregate tools/MCP, skills, memory, system prompt and conversation costs, not individual tool/skill counts or raw prompt content.' })] }) }),
    jsx('section', { className: 'co-card', children: jsxs('div', { children: [jsx('h2', { children: 'Context files · metadata only' }), jsx('p', { className: 'co-muted', children: 'Gateway-reported load status and size. Files are not opened by this plugin; these estimates are not added to the allocation again.' }), value.files.length ? jsx(Table, { caption: 'Context file manifest', headers: ['Source / path', 'Load state', 'Status', 'Characters', 'Est. tokens'], rows: value.files.map(file => [jsxs('span', { children: [jsx('strong', { children: file.label }), jsx('code', { children: file.path || 'No path supplied' })] }), file.loaded, file.status, fmt(file.chars), file.tokens === null ? 'Unknown' : `≈ ${fmt(file.tokens)}`]) }) : jsx('p', { children: 'No context-file metadata was supplied.' })] }) }),
    value.issues.length > 0 && jsx('aside', { className: 'co-card', 'aria-label': 'Data quality notes', children: jsxs('div', { children: [jsx('h2', { children: 'Data quality' }), jsx('ul', { children: value.issues.map(issue => jsx('li', { children: issue }, issue)) })] }) })
  ] })
}

export function Overview() {
  useValue(host.state.focusedSessionId ?? host.state.activeSessionId)
  useValue(host.state.profile)
  useValue(host.state.connectionId ?? host.state.profile)
  useValue(host.state.focusedSessionOwner ?? host.state.focusedSessionProfile ?? host.state.profile)
  useValue(host.state.gateway)
  const busy = useValue(host.state.busy)
  useValue(revision)
  useValue(epochs)
  const scope = snapshot()
  const identity = stamp(scope)
  const route = routeFor(scope)
  const enabled = Boolean(scope.session && scope.gateway === 'open' && !busy && !route.blocked)
  const query = useQuery({
    queryKey: [ID, identity, busy],
    enabled,
    queryFn: async ({ signal }) => {
      if (signal.aborted || identity !== stamp(snapshot())) throw new Error('scope-changed')
      const params = { session_id: scope.session }
      const payload = route.ambient ? await host.request('session.context_breakdown', params, 15000) : await host.requestProfile(route.route, 'session.context_breakdown', params, 15000)
      if (signal.aborted || identity !== stamp(snapshot())) throw new Error('scope-changed')
      const value = normalize(payload)
      if (!value.max) throw new Error('missing-window')
      return value
    },
    staleTime: 15000,
    gcTime: 0,
    retry: (count, error) => count < 2 && ![-32601, 4004].includes(error?.code) && !/method.*(not found|unknown)|unknown method/i.test(error?.message ?? ''),
    retryDelay: count => [1000, 4000][Math.min(count, 1)],
    refetchInterval: query => query.state.status === 'error' ? false : 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    placeholderData: undefined
  })
  useEffect(() => {
    if (!enabled) return
    return host.onEvent('*', event => {
      const payload = event?.payload ?? {}
      const session = event?.session_id ?? payload.session_id
      if (session !== (host.state.focusedSessionId ?? host.state.activeSessionId).get()) return
      if (event.type === 'session.reclaimed' || event.type === 'message.complete' || (event.type === 'status.update' && ['compacting', 'compressing', 'compacted', 'ready'].includes(payload.kind))) revision.set(revision.get() + 1)
    })
  }, [enabled, identity])
  const refresh = () => { if (host.state.gateway.get() === 'open' && !host.state.busy.get()) revision.set(revision.get() + 1) }
  let message = null
  if (!scope.session) message = 'No focused session. Open a conversation to inspect its context.'
  else if (scope.gateway !== 'open') message = 'Gateway disconnected. Context is hidden until the connection is restored.'
  else if (busy) message = 'Session is busy. Context will refresh when the turn ends; no mid-turn estimate is requested.'
  else if (route.blocked) message = route.blocked
  else if (query.isFetching) message = 'Loading context breakdown…'
  else if (query.isError) message = query.error?.message === 'missing-window' ? 'No model window is available yet. Bounded retries finished; refresh after the runtime is ready.' : [-32601, 4004].includes(query.error?.code) || /method.*(not found|unknown)|unknown method/i.test(query.error?.message ?? '') ? 'Context breakdown is unavailable on this gateway. Hermes ≥0.22.2 with session.context_breakdown and the Desktop SDK is required.' : 'Context could not be refreshed. No previous snapshot is shown. Check the gateway and retry.'
  return jsxs('main', { className: 'hermes-context-overview', 'aria-label': 'Context Overview', children: [
    jsx('style', { children: styles }),
    jsxs('header', { className: 'co-header', children: [jsxs('div', { children: [jsx('p', { className: 'co-eyebrow', children: 'CONTEXT OVERVIEW' }), jsx('h1', { children: host.state.focusedSessionId ? 'Focused session' : 'Active session' }), jsx('p', { className: 'co-muted', children: 'Token budget, estimated composition and context-file provenance.' }), jsx('code', { children: scope.session ? `${text(scope.focusedProfile)} · ${text(scope.session)}` : 'No session selected' })] }), jsx(Button, { type: 'button', variant: 'outline', size: 'sm', disabled: !scope.session || scope.gateway !== 'open' || busy || query.isFetching || Boolean(route.blocked), onClick: refresh, children: 'Refresh context' })] }),
    message ? jsx('div', { className: 'co-card co-state', role: query.isError ? 'alert' : 'status', children: message }) : query.data && jsx(Details, { value: query.data }),
    jsx('footer', { className: 'co-muted', children: 'Read-only · follows focused conversation · idle refresh every 60 seconds · no raw prompt or message access' })
  ] })
}

const styles = `
.hermes-context-overview{box-sizing:border-box;height:100%;overflow:auto;padding:clamp(16px,3vw,36px);color:var(--ui-text-primary);font-size:14px;line-height:1.55;container-type:inline-size}
.hermes-context-overview *{box-sizing:border-box}.hermes-context-overview .co-body,.hermes-context-overview .co-card,.hermes-context-overview .co-table-wrap{min-width:0}.hermes-context-overview h1{font-size:28px;line-height:1.2;letter-spacing:-.025em;margin:5px 0 10px}.hermes-context-overview h2{font-size:16px;margin:0 0 8px}.hermes-context-overview p{margin:8px 0}.hermes-context-overview code{display:block;font-size:12px;overflow-wrap:anywhere;white-space:normal;color:var(--ui-text-secondary)}
.hermes-context-overview .co-header{display:flex;gap:20px;justify-content:space-between;align-items:start;margin:0 auto 24px;max-width:1120px}.hermes-context-overview .co-eyebrow{font-size:11px;letter-spacing:.16em;font-weight:650;color:var(--ui-text-secondary)}.hermes-context-overview .co-muted{color:var(--ui-text-secondary);font-size:12px}.hermes-context-overview .co-body{display:grid;gap:18px;max-width:1120px;margin:auto}
.hermes-context-overview .co-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.hermes-context-overview .co-metric,.hermes-context-overview .co-card{border:1px solid var(--ui-stroke-secondary);border-radius:12px;padding:20px;background:var(--ui-bg-card)}.hermes-context-overview .co-metric strong{display:block;font-size:28px;font-variant-numeric:tabular-nums;margin:5px 0}.hermes-context-overview .co-section-title{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}.hermes-context-overview .co-grid{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:5px;margin:16px 0}.hermes-context-overview .co-cell{height:18px;border:1px solid var(--ui-stroke-secondary);border-radius:3px;background:var(--ui-bg-elevated)}.hermes-context-overview .co-occupied{background:var(--ui-accent);border-color:var(--ui-accent)}.hermes-context-overview .co-unknown{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--ui-stroke-secondary) 3px,var(--ui-stroke-secondary) 5px)}.hermes-context-overview .co-legend{display:flex;flex-wrap:wrap;gap:16px;font-size:12px}.hermes-context-overview .co-note{padding:10px 12px;border-left:3px solid var(--ui-accent);background:var(--ui-bg-secondary);font-size:12px}
.hermes-context-overview .co-table-wrap{overflow-x:auto;max-width:100%;margin-top:14px}.hermes-context-overview table{border-collapse:collapse;width:100%;font-size:13px}.hermes-context-overview caption{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ui-text-secondary);padding-bottom:8px}.hermes-context-overview th,.hermes-context-overview td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--ui-stroke-secondary);vertical-align:top;overflow-wrap:anywhere}.hermes-context-overview thead th{font-size:11px;color:var(--ui-text-secondary);font-weight:500}.hermes-context-overview tbody th{font-weight:500}.hermes-context-overview td{font-variant-numeric:tabular-nums}.hermes-context-overview .co-category{display:flex;align-items:center;gap:9px}.hermes-context-overview .co-swatch{width:9px;height:9px;border-radius:2px;flex:none}.hermes-context-overview .co-state{max-width:1120px;margin:auto;min-height:130px;display:flex;align-items:center}.hermes-context-overview footer{max-width:1120px;margin:24px auto 0}.hermes-context-overview :focus-visible{outline:2px solid var(--ui-accent);outline-offset:3px}
@container(max-width:540px){.hermes-context-overview .co-header{flex-direction:column}.hermes-context-overview .co-grid{grid-template-columns:repeat(10,minmax(0,1fr));gap:4px}.hermes-context-overview .co-card{padding:14px}.hermes-context-overview .co-metric strong{font-size:24px}.hermes-context-overview th,.hermes-context-overview td{padding:9px 5px}.hermes-context-overview table{min-width:420px}}
`

export default {
  id: ID,
  name: 'Context Overview',
  defaultEnabled: true,
  register(ctx) {
    for (const state of [host.state.connectionId, host.state.profile, host.state.gateway]) {
      if (state?.listen) ctx.onDispose(state.listen(() => epochs.set(epochs.get() + 1)))
    }
    ctx.register({ id: 'page', area: sdk.ROUTES_AREA, data: { path: PATH }, render: () => jsx(Overview, {}) })
    ctx.register({ id: 'nav', area: sdk.SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Context Overview', codicon: 'graph' } })
    ctx.register({ id: 'open', area: sdk.PALETTE_AREA, data: { id: `${ID}.open`, label: 'Open Context Overview', keywords: ['context', 'tokens', 'budget', 'memory', 'mcp'], run: () => host.navigate(PATH) } })
  }
}
