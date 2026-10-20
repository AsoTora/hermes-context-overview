// Synthetic SDK adapter, not the live Desktop host. Uses real React/React Query.
import { forwardRef, useSyncExternalStore } from 'react'
import { Popover as Primitive } from 'radix-ui'
import { jsx } from 'react/jsx-runtime'
export { useQuery } from '@tanstack/react-query'
export function atom(initial) {
  let value = initial
  const listeners = new Set()
  return { get: () => value, set: next => { value = next; for (const listener of [...listeners]) listener() }, listen: listener => { listeners.add(listener); return () => listeners.delete(listener) }, count: () => listeners.size }
}
export const useValue = store => useSyncExternalStore(store.listen, store.get, store.get)
export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar.nav'
export const PALETTE_AREA = 'palette'
export const Button = forwardRef(function Button({ variant, size, ...props }, ref) { return jsx('button', { ...props, ref, className: 'synthetic-sdk-button' }) })
export const COMPOSER_AREAS = { actions: 'composer.actions' }
export const Popover = Primitive.Root
export const PopoverTrigger = Primitive.Trigger
export function PopoverContent(props) { return jsx(Primitive.Portal, { children: jsx(Primitive.Content, { sideOffset: 6, ...props }) }) }
const events = new Set()
let gateway = {}
export const calls = []
export const pending = new Map()
export let response = null
export let error = null
export let delay = false
let sequence = 0
export const host = {
  state: {
    focusedSessionId: atom('demo-runtime'), activeSessionId: atom('demo-primary'), profile: atom('demo'), connectionId: atom('demo-connection'), focusedSessionOwner: atom({ connectionId: 'demo-connection', profile: 'demo' }), focusedSessionProfile: atom('demo'), gateway: atom('open'), busy: atom(false), busyBySession: atom({})
  },
  getGateway: () => gateway,
  profileRoutes: async () => {
    routeCalls++
    if (routeDelay) return new Promise((resolve, reject) => routePending.push({ resolve, reject }))
    if (routeError) throw new Error('PRIVATE_ROUTE_ERROR')
    return structuredClone(routes)
  },
  navigate: path => { host.lastPath = path },
  onEvent: (type, fn) => { events.add(fn); return () => events.delete(fn) },
  request: (method, params, timeout) => request('ambient', method, params, timeout),
  requestProfile: (route, method, params, timeout) => request(route, method, params, timeout)
}
let routes = []
let routeDelay = false, routeError = false, routeCalls = 0
const routePending = []
let responses = {}
async function request(route, method, params, timeout) {
  if (method !== 'session.context_breakdown') throw new Error(`Unexpected RPC: ${method}`)
  const id = ++sequence
  calls.push({ id, route, method, params, timeout })
  if (delay) return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return structuredClone(responses[params.session_id] ?? response)
}
export const harness = {
  setResponses(value) { responses = value },
  setResponse(value) { response = value; error = null },
  setError(value) { error = value },
  setDelay(value) { delay = value },
  setRoutes(value) { routes = value },
  setRouteDelay(value) { routeDelay = value },
  setRouteError(value) { routeError = value },
  routeCount: () => routeCalls,
  resolveRoutes() { routePending.shift().resolve(structuredClone(routes)) },
  setState(key, value) { host.state[key].set(value) },
  emit(event) { for (const fn of [...events]) fn(event) },
  resolve(id, value) { pending.get(id).resolve(value); pending.delete(id) },
  reconnect() { host.state.gateway.set('connecting'); gateway = {}; host.state.gateway.set('open') },
  getCalls: () => structuredClone(calls),
  listenerCount: () => events.size,
  atomListeners: () => Object.fromEntries(Object.entries(host.state).map(([key, value]) => [key, value.count()])),
  hideOwner() { delete host.state.focusedSessionOwner },
  hideFocus() { delete host.state.focusedSessionId },
  host
}
