import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let browser, server, origin, page
const root = resolve(import.meta.dirname, '..')
const errors = []
before(async () => {
  await mkdir(resolve(root, '.local/browser'), { recursive: true })
  await mkdir(resolve(root, 'docs/screenshots'), { recursive: true })
  await build({ entryPoints: [resolve(root, 'tests/harness.mjs')], bundle: true, format: 'esm', outfile: resolve(root, '.local/browser/harness.js'), alias: { '@hermes/plugin-sdk': resolve(root, 'tests/sdk.mjs') }, logLevel: 'silent' })
  server = createServer(async (request, response) => {
    if (request.url === '/harness.js' || request.url === '/harness.css') {
      response.setHeader('Content-Type', request.url.endsWith('css') ? 'text/css' : 'text/javascript')
      response.end(await readFile(resolve(root, '.local/browser', request.url.slice(1))))
    } else {
      response.setHeader('Content-Type', 'text/html')
      response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Context Overview — synthetic SDK harness</title><link rel="stylesheet" href="/harness.css"></head><body><div class="synthetic-banner">SYNTHETIC SDK HARNESS · PUBLIC DEMO DATA · NOT LIVE DESKTOP</div><div id="app"></div><script type="module" src="/harness.js"></script></body></html>')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
})
afterEach(async () => { if (page) { await page.close(); page = null } })
after(async () => {
  await browser?.close()
  await new Promise(resolve => server?.close(resolve))
  await writeFile(resolve(root, '.local/browser-console.json'), JSON.stringify(errors, null, 2))
  assert.deepEqual(errors, [], 'No browser runtime errors')
})
async function fresh() {
  page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await page.goto(origin)
  await page.waitForSelector('table')
}
async function state(key, value) { await page.evaluate(([key, value]) => window.harness.setState(key, value), [key, value]) }
async function shows(text) { await page.getByText(text, { exact: false }).first().waitFor() }
async function calls() { return page.evaluate(() => window.harness.getCalls()) }
async function refreshWith(value) {
  await page.evaluate(value => window.harness.setResponse(value), value)
  await page.getByRole('button', { name: 'Refresh context' }).click()
}

test('actual register → render → query path: truthful budget, categories and metadata', async () => {
  await fresh()
  assert.equal(await page.locator('[data-cell]').count(), 100)
  assert.equal(await page.locator('[data-cell=occupied]').count(), 36)
  assert.equal(await page.locator('[data-cell=free]').count(), 64)
  await shows('81,920')
  await shows('Estimates differ from overall occupancy by 2,560 tokens')
  await shows('shadowed_by_agents')
  assert.equal((await calls())[0].params.session_id, 'demo-runtime')
  assert.equal((await calls())[0].method, 'session.context_breakdown')
  await page.evaluate(() => window.harness.open())
  assert.equal(await page.evaluate(() => window.harness.host.lastPath), '/context-overview')
})
test('no session, busy, and disconnected states hide stale budgets and suppress reads', async () => {
  await fresh()
  const count = (await calls()).length
  await state('focusedSessionId', null)
  await shows('No focused session')
  assert.equal(await page.locator('[data-cell]').count(), 0)
  await state('focusedSessionId', 'demo-runtime')
  await shows('Context categories')
  await state('busy', true)
  await shows('Session is busy')
  const busyCount = (await calls()).length
  await page.waitForTimeout(80)
  assert.equal((await calls()).length, busyCount)
  await state('busy', false)
  await shows('Context categories')
  await state('gateway', 'closed')
  await shows('Gateway disconnected')
  assert.equal(await page.locator('table').count(), 0)
  assert.ok((await calls()).length >= count)
})
test('refresh loading hides old data, switch race never paints the wrong session', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setDelay(true))
  await page.getByRole('button', { name: 'Refresh context' }).click()
  await shows('Loading context breakdown')
  assert.equal(await page.locator('table').count(), 0)
  const old = (await calls()).at(-1).id
  await state('focusedSessionId', 'demo-second')
  await shows('demo-second')
  await page.waitForFunction(() => window.harness.getCalls().at(-1).params.session_id === 'demo-second')
  const current = (await calls()).at(-1).id
  await page.evaluate(({ old, current }) => {
    const value = { ...window.harness.example, model: 'SECOND_MODEL' }
    window.harness.resolve(current, value)
    window.harness.resolve(old, { ...value, model: 'STALE_MODEL' })
  }, { old, current })
  await shows('SECOND_MODEL')
  assert.equal(await page.getByText('STALE_MODEL').count(), 0)
})
test('connection-qualified owner routes split sessions to exact profile descriptor', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setRoutes([{ connectionId: 'source-b', profile: 'alias-demo', targetProfile: 'demo', mode: 'remote' }]))
  await state('focusedSessionOwner', { connectionId: 'source-b', profile: 'demo' })
  await page.waitForFunction(() => window.harness.getCalls().at(-1).route.connectionId === 'source-b')
  const call = (await calls()).at(-1)
  assert.deepEqual(call.route, { connectionId: 'source-b', profile: 'alias-demo', targetProfile: 'demo', mode: 'remote' })
  await shows('Context categories')
  await state('focusedSessionOwner', null)
  await shows('Session ownership is unresolved')
  assert.equal(await page.locator('table').count(), 0)
})
test('profile switch pending response is suppressed; missing routes fail closed', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setDelay(true))
  await page.getByRole('button', { name: 'Refresh context' }).click()
  const id = (await calls()).at(-1).id
  await state('profile', 'other-profile')
  await shows('no unique connection/profile route')
  await page.evaluate(id => window.harness.resolve(id, { ...window.harness.example, model: 'STALE_PROFILE' }), id)
  assert.equal(await page.getByText('STALE_PROFILE').count(), 0)
  assert.equal(await page.locator('table').count(), 0)
})
test('ambiguous connection-qualified descriptors never issue an ambient fallback', async () => {
  await fresh()
  const count = (await calls()).length
  await page.evaluate(() => window.harness.setRoutes([
    { connectionId: 'source-b', profile: 'alias-a', targetProfile: 'demo', mode: 'remote' },
    { connectionId: 'source-b', profile: 'alias-b', targetProfile: 'demo', mode: 'remote' }
  ]))
  await state('focusedSessionOwner', { connectionId: 'source-b', profile: 'demo' })
  await shows('no unique connection/profile route')
  assert.equal((await calls()).length, count)
})
test('connection and profile replacement bind the new snapshot despite identical session IDs', async () => {
  await fresh()
  await page.evaluate(() => {
    window.harness.setResponse({ ...window.harness.example, model: 'REPLACEMENT_MODEL' })
    window.harness.setState('connectionId', 'source-b')
    window.harness.setState('profile', 'other')
    window.harness.setState('focusedSessionOwner', { connectionId: 'source-b', profile: 'other' })
  })
  await shows('REPLACEMENT_MODEL')
  await shows('other · demo-runtime')
  assert.equal((await calls()).at(-1).route, 'ambient')
})
test('reconnect discards pending previous-gateway results even with same labels', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setDelay(true))
  await page.getByRole('button', { name: 'Refresh context' }).click()
  const previous = (await calls()).at(-1).id
  await state('gateway', 'closed')
  await shows('Gateway disconnected')
  await page.evaluate(() => window.harness.reconnect())
  await page.waitForFunction(previous => window.harness.getCalls().at(-1).id > previous, previous)
  const current = (await calls()).at(-1).id
  await page.evaluate(({ previous, current }) => {
    window.harness.resolve(previous, { ...window.harness.example, model: 'OLD_GATEWAY' })
    window.harness.resolve(current, { ...window.harness.example, model: 'NEW_GATEWAY' })
  }, { previous, current })
  await shows('NEW_GATEWAY')
  assert.equal(await page.getByText('OLD_GATEWAY').count(), 0)
})
test('unknown RPC method has quiet compatibility error without retries or stale data', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setError({ code: -32601, message: 'Method not found' }))
  const count = (await calls()).length
  await page.getByRole('button', { name: 'Refresh context' }).click()
  await shows('Hermes ≥0.22.2')
  assert.equal(await page.locator('table').count(), 0)
  await page.waitForTimeout(1200)
  assert.equal((await calls()).length, count + 1)
})
test('transient errors retry exactly twice then stop and allow explicit recovery', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setError({ code: 5000, message: 'private details must not render' }))
  const count = (await calls()).length
  await page.getByRole('button', { name: 'Refresh context' }).click()
  await page.getByRole('alert').waitFor({ timeout: 10000 })
  assert.equal((await calls()).length, count + 3)
  assert.equal(await page.getByText('private details must not render').count(), 0)
  await refreshWith(await page.evaluate(() => window.harness.example))
  await shows('Context categories')
})
test('zero-window rebuild has bounded retries; categories can be empty without fabricated data', async () => {
  await fresh()
  await refreshWith({ context_max: 0, context_used: 0, categories: [] })
  await shows('Bounded retries finished')
  await refreshWith({ context_max: 1000, context_used: 200, estimated_total: 0, categories: [], context_source: 'provider_usage' })
  await shows('No category estimates are available yet')
  assert.equal(await page.locator('[data-cell=occupied]').count(), 20)
})
test('malformed numbers, overbudget, zero conversation and Unicode remain honest', async () => {
  await fresh()
  const example = await page.evaluate(() => window.harness.example)
  await refreshWith({ ...example, context_used: -1, categories: [{ id: 'conversation', label: '会話 · Conversation', tokens: 0 }, { tokens: -4 }] })
  await shows('会話 · Conversation')
  assert.equal(await page.locator('[data-cell=unknown]').count(), 100)
  await shows('Malformed category rows were omitted')
  await refreshWith({ ...example, context_max: 1000, context_used: 1200 })
  await shows('Over budget by 200 tokens')
  assert.equal(await page.locator('[data-cell=occupied]').count(), 100)
  assert.equal(await page.locator('[data-cell=free]').count(), 0)
})
test('metadata-only safety: raw bodies and colors ignored; text escaped; no extra RPCs', async () => {
  await fresh()
  const example = await page.evaluate(() => window.harness.example)
  await refreshWith({ ...example, prompt: 'RAW_PRIVATE_BODY', categories: [{ id: 'unknown', label: '<img src=x onerror=alert(1)>', tokens: 1, color: 'url(https://private.invalid/leak)' }], context_files: [{ label: 'Rules', path: '/demo/safe.md', content: 'RAW_PRIVATE_BODY', chars: 12, est_tokens: 3, loaded: true, status: 'loaded' }] })
  await shows('<img src=x onerror=alert(1)>')
  assert.equal(await page.locator('main img,main script').count(), 0)
  assert.equal(await page.getByText('RAW_PRIVATE_BODY').count(), 0)
  assert.ok((await calls()).every(call => call.method === 'session.context_breakdown' && Object.keys(call.params).join() === 'session_id'))
})
test('compression/reclaim invalidation and lifecycle cleanup', async () => {
  await fresh()
  assert.equal(await page.evaluate(() => window.harness.listenerCount()), 1)
  const count = (await calls()).length
  await page.evaluate(() => window.harness.emit({ type: 'status.update', session_id: 'different', payload: { kind: 'compacted' } }))
  assert.equal((await calls()).length, count)
  await page.evaluate(() => window.harness.emit({ type: 'status.update', session_id: 'demo-runtime', payload: { kind: 'compacted' } }))
  await page.waitForFunction(count => window.harness.getCalls().length > count, count)
  await shows('Context categories')
  const next = (await calls()).length
  await page.evaluate(() => window.harness.emit({ type: 'session.reclaimed', session_id: 'demo-runtime' }))
  await page.waitForFunction(count => window.harness.getCalls().length > count, next)
  await shows('Context categories')
  await page.evaluate(() => window.harness.dispose())
  await page.waitForFunction(() => window.harness.listenerCount() === 0)
  const listeners = await page.evaluate(() => window.harness.atomListeners())
  assert.ok(Object.values(listeners).every(count => count === 0))
})
test('older SDK fallback to active session works without body/title lookup', async () => {
  await fresh()
  await page.evaluate(() => { window.harness.unmount() })
  await page.waitForFunction(() => window.harness.listenerCount() === 0)
  await page.evaluate(() => { window.harness.hideOwner(); window.harness.hideFocus(); window.harness.mount() })
  await shows('Active session')
  await page.waitForFunction(() => window.harness.getCalls().at(-1).params.session_id === 'demo-primary')
  await shows('Context categories')
})
test('older SDK without exact owner metadata rejects colliding multi-source profiles', async () => {
  await fresh()
  await page.evaluate(() => window.harness.unmount())
  await page.waitForFunction(() => window.harness.listenerCount() === 0)
  const count = (await calls()).length
  await page.evaluate(() => {
    window.harness.hideOwner()
    window.harness.setRoutes([
      { connectionId: 'source-a', profile: 'demo', targetProfile: 'demo' },
      { connectionId: 'source-b', profile: 'demo', targetProfile: 'demo' }
    ])
    window.harness.mount()
  })
  await shows('required to distinguish multiple connections')
  assert.equal((await calls()).length, count)
})
test('public-safe screenshots: wide/narrow, light/dark, keyboard focus and no page overflow', async () => {
  await fresh()
  const samples = []
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
      await page.setViewportSize({ width, height: width === 390 ? 950 : 1100 })
      await page.getByRole('button', { name: 'Refresh context' }).focus()
      await page.keyboard.press('Tab')
      assert.ok(await page.evaluate(() => document.activeElement.tagName === 'BUTTON' || document.activeElement.getAttribute('role') === 'region'))
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      assert.equal(await page.evaluate(() => { const main = document.querySelector('main'); return main.scrollWidth === main.clientWidth }), true, 'Only individual tables may scroll horizontally')
      const contrast = await page.evaluate(() => {
        const sample = document.querySelector('.co-muted')
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.fillStyle = getComputedStyle(document.body).backgroundColor
        ctx.fillRect(0, 0, 1, 1)
        const bg = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
        ctx.fillStyle = getComputedStyle(sample).color
        ctx.fillRect(0, 0, 1, 1)
        const fg = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
        const luminance = rgb => rgb.map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
        const a = luminance(bg), b = luminance(fg)
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
      })
      assert.ok(contrast >= 4.5, `${theme} text contrast ${contrast}`)
      samples.push({ theme, width, secondaryTextContrast: contrast })
      const height = await page.evaluate(() => document.querySelector('main').scrollHeight + document.querySelector('.synthetic-banner').getBoundingClientRect().height + 10)
      await page.setViewportSize({ width, height: Math.ceil(height) })
      await page.evaluate(() => { document.querySelector('main').scrollTo(0, 0); window.scrollTo(0, 0) })
      await page.screenshot({ path: resolve(root, `docs/screenshots/harness-${theme}-${width}.png`), fullPage: true })
    }
  }
  await writeFile(resolve(root, '.local/browser-visual-checks.json'), JSON.stringify(samples, null, 2))
})
