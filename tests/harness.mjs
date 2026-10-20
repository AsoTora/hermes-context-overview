// Synthetic host: real plugin contribution, React Query and Radix Popover.
// Ownership seam mirrors core tree/store.ts trackActiveTreeGroup: window capture
// pointerdown/focusin publishes the focused session BEFORE plugin handlers run.
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { jsx, jsxs } from 'react/jsx-runtime'
import plugin from '../desktop/plugin.js'
import { harness } from './sdk.mjs'
import { example } from './example.mjs'
import './harness-theme.css'
harness.setResponse(example)
const contributions = [], disposers = []
plugin.register({ register: value => { contributions.push(value); return () => {} }, onDispose: fn => disposers.push(fn) })
const root = createRoot(document.getElementById('app'))
const client = new QueryClient()
const action = contributions.find(value => value.area === 'composer.actions')
const scopes = {
  first: { session: 'demo-runtime', owner: { connectionId: 'demo-connection', profile: 'demo' } },
  second: { session: 'demo-second', owner: { connectionId: 'source-b', profile: 'demo' } }
}
harness.setRoutes([{ connectionId: 'source-b', profile: 'demo', targetProfile: 'demo', mode: 'remote' }])
function routeFocus(event) {
  const key = event.target.closest?.('[data-tree-group]')?.dataset.treeGroup
  const scope = scopes[key]
  if (!scope) return
  harness.setState('focusedSessionOwner', scope.owner)
  harness.setState('focusedSessionId', scope.session)
}
window.addEventListener('pointerdown', routeFocus, true)
window.addEventListener('focusin', routeFocus, true)
function mount() {
  root.render(jsx(QueryClientProvider, { client, children: jsx('main', { className: 'demo-conversations', children: Object.keys(scopes).map((key, index) => jsxs('section', { 'data-tree-group': key, 'aria-label': `Conversation ${index + 1}`, className: 'demo-conversation', children: [
    jsx('h1', { children: index ? 'Release checklist' : 'Build a context viewer' }),
    jsx('p', { className: 'demo-message', children: index ? 'Track the remaining release checks in this conversation.' : 'Show this conversation’s token budget without leaving the chat.' }),
    jsxs('div', { className: 'demo-composer', children: [jsx('textarea', { 'aria-label': `Message conversation ${index + 1}`, placeholder: 'Message Hermes…' }), jsxs('div', { className: 'demo-actions', children: [action.render(), jsx('span', { children: 'Demo model' }), jsx('button', { type: 'button', children: 'Send' })] })] })
  ] }, key)) }) }))
}
window.harness = {
  ...harness, example, contributions: contributions.map(({ render, ...value }) => value), scopes,
  mount, unmount() { root.render(null) },
  dispose() {
    root.render(null); for (const fn of disposers) fn(); client.clear()
    window.removeEventListener('pointerdown', routeFocus, true)
    window.removeEventListener('focusin', routeFocus, true)
  }
}
mount()
