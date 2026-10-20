// Synthetic browser host. The plugin is registered/rendered unchanged.
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { jsx } from 'react/jsx-runtime'
import plugin from '../desktop/plugin.js'
import { harness } from './sdk.mjs'
import { example } from './example.mjs'
import './harness-theme.css'
harness.setResponse(example)
const contributions = []
const disposers = []
plugin.register({ register: value => { contributions.push(value); return () => {} }, onDispose: fn => disposers.push(fn) })
const root = createRoot(document.getElementById('app'))
const client = new QueryClient()
const route = contributions.find(value => value.data?.path === '/context-overview' && value.render)
function mount() { root.render(jsx(QueryClientProvider, { client, children: route.render() })) }
window.harness = {
  ...harness, example, contributions: contributions.map(({ render, ...value }) => value),
  mount, unmount() { root.render(null) },
  dispose() { root.render(null); for (const fn of disposers) fn(); client.clear() },
  open() { contributions.find(value => value.area === 'palette').data.run() }
}
mount()
