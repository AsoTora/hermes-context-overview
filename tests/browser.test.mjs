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
async function fresh(open = true) {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await page.goto(origin)
  await page.getByRole('button', { name: 'Context', exact: true }).first().waitFor()
  if (open) { await trigger(0).click(); await shows('Estimated allocation') }
}
const trigger = index => page.getByRole('button', { name: 'Context', exact: true }).nth(index)
async function state(key, value) { await page.evaluate(([key, value]) => window.harness.setState(key, value), [key, value]) }
async function shows(text) { await page.getByText(text, { exact: false }).first().waitFor() }
async function calls() { return page.evaluate(() => window.harness.getCalls()) }
async function refreshWith(value) {
  await page.evaluate(value => window.harness.setResponse(value), value)
  await page.getByRole('button', { name: 'Refresh context' }).click()
}
async function closed() { await page.getByRole('dialog').waitFor({ state: 'detached' }); await page.waitForTimeout(30) }
async function expand(text) { await page.getByText(text, { exact: true }).click() }

test('two simultaneous composers bind pointer and keyboard activation to their exact owners, lazily', async () => {
  await fresh(false)
  assert.equal((await calls()).length, 0, 'No eager RPC from either mounted composer')
  assert.equal(await trigger(0).innerText(), 'Context')
  assert.equal(await trigger(1).innerText(), 'Context')
  await page.evaluate(() => window.harness.setResponses({
    'demo-runtime': { ...window.harness.example, context_used: 46080, model: 'FIRST_MODEL' },
    'demo-second': { ...window.harness.example, context_used: 76800, model: 'SECOND_MODEL' }
  }))
  await trigger(1).click()
  await shows('SECOND_MODEL')
  assert.equal(await page.locator('[data-cell=occupied]').count(), 60)
  let call = (await calls()).at(-1)
  assert.equal(call.params.session_id, 'demo-second')
  assert.deepEqual(call.route, { connectionId: 'source-b', profile: 'demo', targetProfile: 'demo', mode: 'remote' })
  assert.equal(await page.getByText('FIRST_MODEL', { exact: false }).count(), 0)
  await page.keyboard.press('Escape'); await closed()
  assert.equal(await trigger(1).evaluate(node => node === document.activeElement), true)
  // Keyboard focusin routes first's group before Enter; no pointer prerequisite.
  await trigger(0).focus(); await page.keyboard.press('Enter')
  await shows('FIRST_MODEL')
  assert.equal(await page.locator('[data-cell=occupied]').count(), 36)
  call = (await calls()).at(-1)
  assert.equal(call.params.session_id, 'demo-runtime'); assert.equal(call.route, 'ambient')
  assert.equal(await page.getByText('SECOND_MODEL', { exact: false }).count(), 0)
  await page.keyboard.press('Escape'); await closed()
  await trigger(1).focus(); await page.keyboard.press('Space'); await shows('SECOND_MODEL')
  await page.getByRole('heading', { name: 'Release checklist' }).click(); await closed()
  const count = (await calls()).length
  await page.waitForTimeout(100)
  assert.equal((await calls()).length, count)
  assert.equal(await page.evaluate(() => window.harness.listenerCount()), 0)
  assert.deepEqual(await page.evaluate(() => window.harness.contributions.map(value => value.area)), ['composer.actions'])
})
test('truthful compact summary, category estimates and collapsed metadata disclosure', async () => {
  await fresh()
  assert.equal(await page.locator('[data-cell]').count(), 100)
  assert.equal(await page.locator('[data-cell=occupied]').count(), 36)
  assert.equal(await page.locator('[data-cell=free]').count(), 64)
  await shows('81,920 free')
  assert.equal(await page.getByText('shadowed_by_agents', { exact: false }).isVisible(), false)
  await expand('How estimates differ'); await shows('Estimates differ from overall occupancy by 2,560 tokens')
  await expand('Context files · metadata only'); await shows('shadowed_by_agents')
  assert.equal((await calls())[0].params.session_id, 'demo-runtime')
})
test('unrelated conversation busy state does not hide or refetch this owner', async () => {
  await fresh()
  const count = (await calls()).length
  await state('busyBySession', { 'demo-runtime': false, 'demo-second': true })
  await shows('Estimated allocation')
  assert.equal((await calls()).length, count)
  await state('busyBySession', { 'demo-runtime': true, 'demo-second': false })
  await shows('Session is busy')
  assert.equal(await page.locator('[data-cell]').count(), 0)
  assert.equal((await calls()).length, count)
  await state('busyBySession', { 'demo-runtime': false })
  await shows('Estimated allocation')
})
test('focus/owner switch closes, never retargets an open instance, and rejects late results', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setDelay(true))
  await page.getByRole('button', { name: 'Refresh context' }).click()
  await shows('Loading context breakdown')
  const old = (await calls()).at(-1).id
  // Activating another composer must not reuse first's open popup or response.
  await trigger(1).click()
  await page.waitForFunction(() => window.harness.getCalls().at(-1).params.session_id === 'demo-second')
  const current = (await calls()).at(-1).id
  await page.evaluate(({ old, current }) => {
    window.harness.resolve(current, { ...window.harness.example, model: 'SECOND_MODEL' })
    window.harness.resolve(old, { ...window.harness.example, model: 'STALE_MODEL' })
  }, { old, current })
  await shows('SECOND_MODEL')
  assert.equal(await page.getByText('STALE_MODEL', { exact: false }).count(), 0)
  assert.equal(await trigger(0).getAttribute('aria-expanded'), 'false')
  const count = (await calls()).length
  await state('focusedSessionOwner', { connectionId: 'different-source', profile: 'demo' })
  await closed()
  assert.equal((await calls()).length, count, 'Owner mutation never starts a retargeted RPC')
})
test('disconnect/reconnect with identical labels closes and rejects previous gateway result', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setDelay(true))
  await page.getByRole('button', { name: 'Refresh context' }).click()
  const old = (await calls()).at(-1).id
  await page.evaluate(() => window.harness.reconnect())
  await closed()
  assert.equal((await calls()).at(-1).id, old)
  await page.evaluate(id => window.harness.resolve(id, { ...window.harness.example, model: 'OLD_GATEWAY' }), old)
  await page.evaluate(() => { window.harness.setDelay(false); window.harness.setResponse({ ...window.harness.example, model: 'NEW_GATEWAY' }) })
  await trigger(0).click(); await shows('NEW_GATEWAY')
  assert.equal(await page.getByText('OLD_GATEWAY', { exact: false }).count(), 0)
})
test('missing/ambiguous routes and absent SDK owner fail closed with no ambient fallback', async () => {
  await fresh(false)
  await page.evaluate(() => window.harness.setRoutes([]))
  await trigger(1).click(); await shows('no unique connection/profile route')
  assert.equal((await calls()).length, 0)
  await page.keyboard.press('Escape'); await closed()
  await page.evaluate(() => window.harness.setRoutes([
    { connectionId: 'source-b', profile: 'alias-a', targetProfile: 'demo' },
    { connectionId: 'source-b', profile: 'alias-b', targetProfile: 'demo' }
  ]))
  await trigger(1).click(); await shows('no unique connection/profile route')
  assert.equal((await calls()).length, 0)
  await page.keyboard.press('Escape'); await closed()
  await page.evaluate(() => { window.harness.scopes.first.owner = null })
  await trigger(0).click(); await shows('Session ownership is unresolved')
  assert.equal((await calls()).length, 0)
})
test('empty conversation, profile and session changes gate popup until deliberate reopen', async () => {
  await fresh()
  await state('focusedSessionId', null); await closed()
  await page.evaluate(() => { window.harness.scopes.first.session = null })
  await trigger(0).click(); await shows('No session yet')
  await page.keyboard.press('Escape'); await closed()
  await page.evaluate(() => { window.harness.scopes.first.session = 'demo-runtime' })
  await trigger(0).click(); await shows('Estimated allocation')
  const count = (await calls()).length
  await state('profile', 'another-profile'); await closed()
  assert.equal((await calls()).length, count)
})
test('unknown RPC method has quiet compatibility error without retries or stale data', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setError({ code: -32601, message: 'Method not found' }))
  const count = (await calls()).length
  await page.getByRole('button', { name: 'Refresh context' }).click()
  await shows('Hermes ≥0.22.2')
  assert.equal(await page.locator('[data-cell]').count(), 0)
  await page.waitForTimeout(1200)
  assert.equal((await calls()).length, count + 1)
})
test('transient errors retry twice, redact error detail, then recover explicitly', async () => {
  await fresh()
  await page.evaluate(() => window.harness.setError({ code: 5000, message: 'PRIVATE_ERROR_DETAIL' }))
  const count = (await calls()).length
  await page.getByRole('button', { name: 'Refresh context' }).click()
  await page.getByRole('alert').waitFor({ timeout: 10000 })
  assert.equal((await calls()).length, count + 3)
  assert.equal(await page.getByText('PRIVATE_ERROR_DETAIL').count(), 0)
  await refreshWith(await page.evaluate(() => window.harness.example)); await shows('Estimated allocation')
})
test('zero-window rebuild bounded retries and absent estimates are explicit', async () => {
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
  await expand('Data quality notes'); await shows('Malformed category rows were omitted')
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
  await expand('Context files · metadata only'); await shows('/demo/safe.md')
  assert.equal(await page.locator('[role=dialog] img,[role=dialog] script').count(), 0)
  assert.equal(await page.getByText('RAW_PRIVATE_BODY').count(), 0)
  assert.ok((await calls()).every(call => call.method === 'session.context_breakdown' && Object.keys(call.params).join() === 'session_id'))
})
test('completion/compression/reclaim invalidation only while open; disposal cleans subscriptions', async () => {
  await fresh()
  assert.equal(await page.evaluate(() => window.harness.listenerCount()), 1)
  const count = (await calls()).length
  await page.evaluate(() => window.harness.emit({ type: 'status.update', connectionId: 'source-b', profile: 'demo', session_id: 'demo-runtime', payload: { kind: 'compacted' } }))
  await page.waitForTimeout(80)
  assert.equal((await calls()).length, count, 'Same runtime ID on a foreign connection must not invalidate this owner')
  await page.evaluate(() => window.harness.emit({ type: 'status.update', session_id: 'different', payload: { kind: 'compacted' } }))
  assert.equal((await calls()).length, count)
  for (const type of ['status.update', 'session.reclaimed', 'message.complete']) {
    const before = (await calls()).length
    await page.evaluate(type => window.harness.emit({ type, session_id: 'demo-runtime', payload: { kind: 'compacted' } }), type)
    await page.waitForFunction(count => window.harness.getCalls().length > count, before)
    await shows('Estimated allocation')
  }
  await page.keyboard.press('Escape'); await closed()
  assert.equal(await page.evaluate(() => window.harness.listenerCount()), 0)
  await page.evaluate(() => window.harness.dispose())
  await page.waitForFunction(() => Object.values(window.harness.atomListeners()).every(count => count === 0))
})
test('synthetic in-conversation screenshots: light/dark, narrow/wide, contained popup and keyboard dismissal', async () => {
  await fresh()
  const samples = []
  for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
    await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
    await page.setViewportSize({ width, height: 900 })
    await page.keyboard.press('Escape'); await closed()
    const index = width === 390 ? 1 : 0
    await trigger(index).focus(); await page.keyboard.press('Enter'); await shows('Estimated allocation')
    await page.waitForTimeout(80)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const box = await page.getByRole('dialog').boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 900)
    await expand('Context files · metadata only')
    assert.equal(await page.getByRole('dialog').evaluate(node => node.scrollWidth === node.clientWidth), true)
    await page.getByRole('dialog').evaluate(node => { node.scrollTop = 0 })
    await expand('Context files · metadata only')
    await page.getByRole('dialog').evaluate(node => { node.scrollTop = 0 })
    await page.evaluate(() => window.scrollTo(0, 0))
    const contrast = await page.evaluate(() => {
      const sample = document.querySelector('.co-muted'), panel = document.querySelector('[role=dialog]')
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const rgb = color => { ctx.fillStyle = getComputedStyle(panel).backgroundColor; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3) }
      const luminance = values => values.map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
      const bg = luminance(rgb(getComputedStyle(panel).backgroundColor)), fg = luminance(rgb(getComputedStyle(sample).color))
      return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05)
    })
    assert.ok(contrast >= 4.5)
    samples.push({ theme, width, secondaryTextContrast: contrast })
    await page.screenshot({ path: resolve(root, `docs/screenshots/harness-${theme}-${width}.png`), fullPage: true })
    await page.keyboard.press('Escape'); await closed()
    assert.equal(await trigger(index).evaluate(node => document.activeElement === node), true)
  }
  await writeFile(resolve(root, '.local/browser-visual-checks.json'), JSON.stringify(samples, null, 2))
})
