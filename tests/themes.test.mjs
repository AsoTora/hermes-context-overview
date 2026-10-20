import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { palettes } from './fixtures/native-themes/runtime.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, '.local/theme-review')
const names = ['nous', 'github', 'catppuccin', 'everforest', 'solarized', 'nous-alt', 'classic', 'midnight', 'ember', 'mono', 'slate', 'cyberpunk']

// All colors are rendered by Chromium before measuring (including alpha and
// nested color-mix). No hex-only shortcut or guessed light/dark test palette.
function visualMetrics() {
  const panel = document.querySelector('.hermes-context-overview')
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const rgb = (color, background = getComputedStyle(panel).backgroundColor) => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = background; ctx.fillRect(0, 0, 1, 1)
    ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
  }
  const luminance = values => values.map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0)
  const ratio = (a, b) => { const x = luminance(rgb(a)), y = luminance(rgb(b)); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
  const bg = getComputedStyle(panel).backgroundColor
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
  const text = []
  while (walker.nextNode()) {
    const node = walker.currentNode, parent = node.parentElement
    if (!node.textContent.trim() || ['STYLE', 'SCRIPT'].includes(parent.tagName) || !parent.checkVisibility()) continue
    const range = document.createRange(); range.selectNodeContents(node)
    if (!range.getBoundingClientRect().height) continue
    text.push({ text: node.textContent.trim(), contrast: ratio(getComputedStyle(parent).color, bg) })
  }
  const free = getComputedStyle(panel.querySelector('[data-cell=free]'))
  const occupied = getComputedStyle(panel.querySelector('[data-cell=occupied]'))
  const swatches = [...panel.querySelectorAll('.co-swatch')].map(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect()
    return { rgb: rgb(style.backgroundColor), contrast: ratio(style.backgroundColor, bg), width: box.width, height: box.height }
  })
  return { text, surface: rgb(bg), occupied: rgb(occupied.backgroundColor), occupiedContrast: ratio(occupied.backgroundColor, bg), freeEdgeContrast: ratio(free.borderTopColor, free.backgroundColor), swatches, overflow: panel.scrollWidth > panel.clientWidth, pageOverflow: document.documentElement.scrollWidth > innerWidth }
}

async function sheets(browser, samples) {
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
  const cards = []
  for (const sample of samples) cards.push({ ...sample, data: (await readFile(resolve(output, sample.file))).toString('base64') })
  const style = 'body{margin:0;padding:24px;background:#eeeef0;color:#25252b;font:14px system-ui}h1{font-size:20px;margin:0 0 8px}p{margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat(3,390px);gap:16px}figure{margin:0;background:white;padding:8px;border-radius:10px}figcaption{font-weight:600;margin:4px 0 8px}img{width:100%;height:auto;display:block}a{color:inherit}small{font-weight:400}'
  const figure = (s, inline = false) => `<figure><figcaption>${escape(s.label)} · ${s.mode}${s.synthesized ? ' (native synthesized)' : ''} · ${s.width}px</figcaption><a href="${s.file}"><img alt="Synthetic ${s.name} ${s.mode} popup, not live Desktop" src="${inline ? 'data:image/png;base64,' + s.data : s.file}"></a></figure>`
  const sheetPage = await browser.newPage({ viewport: { width: 1250, height: 900 }, deviceScaleFactor: 1 })
  const sheetFiles = []
  for (const width of [1280, 390]) for (const mode of ['light', 'dark']) {
    const group = cards.filter(s => s.width === width && s.mode === mode)
    for (let i = 0; i < group.length; i += 6) {
      const file = `sheet-${mode}-${width}-${i / 6 + 1}.png`
      await sheetPage.setContent(`<style>${style}</style><h1>Context Overview · ${mode} · ${width}px · ${i / 6 + 1}/2</h1><p>SYNTHETIC SDK HARNESS · NOT LIVE DESKTOP · Native Hermes tokens · Approval required before publication</p><div class="grid">${group.slice(i, i + 6).map(s => figure(s, true)).join('')}</div>`)
      await sheetPage.evaluate(() => Promise.all([...document.images].map(img => img.decode())))
      await sheetPage.screenshot({ path: resolve(output, file), fullPage: true })
      sheetFiles.push(file)
    }
  }
  await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Context Overview — local approval gallery</title><style>${style}.grid{grid-template-columns:repeat(auto-fit,minmax(340px,390px))}</style><h1>Context Overview — theme approval gallery</h1><p>SYNTHETIC SDK HARNESS · NOT LIVE DESKTOP. 12 built-ins, 24 native light/dark palettes, wide + narrow. No runtime changes. User approval is required before publication.</p><p>Native dark-only seeds have real synthesized light modes; no invented overrides. Remote fonts, window materials and native SDK component styling are not reproduced.</p><p>${sheetFiles.map(file => `<a href="${file}">${file}</a>`).join(' · ')}</p><div class="grid">${cards.map(s => figure(s)).join('')}</div></html>`)
  await sheetPage.close()
  return sheetFiles
}

test('every native built-in palette: readable text, visible cells/swatches, narrow containment, live switches and approval gallery', async () => {
  assert.deepEqual([...new Set(palettes.map(p => p.name))], names)
  assert.equal(palettes.length, 24)
  assert.deepEqual(palettes.filter(p => p.synthesized).map(p => p.name), ['midnight', 'ember', 'mono', 'slate', 'cyberpunk'])
  await mkdir(output, { recursive: true })
  await build({ entryPoints: [resolve(root, 'tests/harness.mjs')], bundle: true, format: 'esm', outfile: resolve(output, 'harness.js'), alias: { '@hermes/plugin-sdk': resolve(root, 'tests/sdk.mjs') }, logLevel: 'silent' })
  const server = createServer(async (request, response) => {
    if (['/harness.js', '/harness.css'].includes(request.url)) {
      response.setHeader('Content-Type', request.url.endsWith('css') ? 'text/css' : 'text/javascript')
      response.end(await readFile(resolve(output, request.url.slice(1))))
    } else {
      response.setHeader('Content-Type', 'text/html')
      response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Synthetic theme review — NOT live Desktop</title><link rel="stylesheet" href="/harness.css"><body><div class="synthetic-banner">SYNTHETIC SDK HARNESS · PUBLIC DEMO DATA · NOT LIVE DESKTOP</div><div id="app"></div><script type="module" src="/harness.js"></script></body></html>')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ headless: true })
  const errors = [], unexpectedRequests = [], samples = []
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.route('**/*', route => { if (route.request().url().startsWith(origin)) return route.continue(); unexpectedRequests.push(route.request().url()); return route.abort() })
    await page.goto(origin)
    await page.getByRole('button', { name: 'Context', exact: true }).click()
    await page.getByText('Estimated allocation', { exact: true }).waitFor()
    const callCount = await page.evaluate(() => window.harness.getCalls().length)
    await page.evaluate(() => { window.reviewPanel = document.querySelector('.hermes-context-overview') })
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const palette of palettes) {
        await page.evaluate(({ name, mode }) => window.harness.applyNativeTheme(name, mode), palette)
        await page.waitForTimeout(40)
        const metrics = await page.evaluate(visualMetrics)
        const id = `${palette.name}-${palette.mode}-${width}`
        assert.equal(metrics.overflow || metrics.pageOverflow, false, `${id}: no overflow`)
        const heights = await page.getByRole('dialog').evaluate(n => ({ scroll: n.scrollHeight, client: n.clientHeight }))
        assert.ok(heights.scroll <= heights.client, `${id}: default footer fits ${JSON.stringify(heights)}`)
        assert.ok(metrics.text.length >= 20, `${id}: text measurement covers the popup`)
        assert.ok(metrics.text.every(s => s.contrast >= 4.5), `${id}: text contrast ${JSON.stringify(metrics.text.filter(s => s.contrast < 4.5))}`)
        assert.ok(metrics.freeEdgeContrast >= 1.5, `${id}: free cell boundary`)
        assert.ok(metrics.occupiedContrast >= 2, `${id}: occupied cell visible`)
        assert.equal(metrics.swatches.length, 8)
        assert.ok(metrics.swatches.every(s => s.contrast >= 1.5 && s.width >= 8 && s.height >= 8), `${id}: visible semantic swatches`)
        assert.equal(new Set(metrics.swatches.map(s => s.rgb.join(','))).size, 8, `${id}: distinct semantic swatches`)
        assert.equal(await page.locator('[data-cell=occupied]').count(), 36)
        assert.equal(await page.locator('[data-cell=free]').count(), 64)
        assert.equal(await page.evaluate(() => window.reviewPanel === document.querySelector('.hermes-context-overview')), true, 'Theme switch does not remount the popup')
        assert.equal(await page.evaluate(() => window.harness.getCalls().length), callCount, 'Theme switch does not request context')
        const box = await page.getByRole('dialog').boundingBox()
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 32 && box.y + box.height <= 900, `${id}: popup contained`)
        await page.evaluate(({ box, id }) => {
          let label = document.getElementById('review-label')
          if (!label) { label = document.createElement('div'); label.id = 'review-label'; document.body.append(label) }
          label.textContent = `${id} · SYNTHETIC · NOT LIVE DESKTOP`
          Object.assign(label.style, { position: 'fixed', left: box.x + 'px', top: box.y - 30 + 'px', width: box.width + 'px', height: '28px', boxSizing: 'border-box', padding: '6px 4px', background: 'var(--ui-bg-elevated)', color: 'var(--ui-text-primary)', font: '9px system-ui', zIndex: '99999' })
        }, { box, id })
        const file = `${id}.png`
        await page.screenshot({ path: resolve(output, file), clip: { x: box.x, y: box.y - 30, width: box.width, height: box.height + 30 } })
        samples.push({ name: palette.name, label: palette.label, mode: palette.mode, synthesized: palette.synthesized, width, file, metrics })
      }
    }
    // The whole switch sequence returns exactly to its initial native palette.
    await page.evaluate(() => { window.harness.applyNativeTheme('nous', 'light'); document.getElementById('review-label')?.remove() })
    assert.deepEqual((await page.evaluate(visualMetrics)).surface, samples[0].metrics.surface)
    // Expanded metadata, unknown cells and unusually long labels at narrow width.
    await page.getByText('Context files · metadata only', { exact: true }).click()
    assert.equal(await page.getByRole('dialog').evaluate(n => n.scrollWidth > n.clientWidth), false)
    await page.screenshot({ path: resolve(output, 'narrow-metadata-expanded.png'), fullPage: true })
    await page.evaluate(() => window.harness.setResponse({ ...window.harness.example, context_used: -1, categories: [{ id: 'unknown', label: 'Long synthetic category '.repeat(12), tokens: 1 }] }))
    await page.getByRole('button', { name: 'Refresh context' }).click()
    await page.locator('[data-cell=unknown]').first().waitFor()
    assert.equal(await page.locator('[data-cell=unknown]').count(), 100)
    assert.equal(await page.getByRole('dialog').evaluate(n => n.scrollWidth > n.clientWidth), false)
    await page.screenshot({ path: resolve(output, 'narrow-unknown.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.activeElement?.textContent === 'Context')
    assert.equal(await page.getByRole('button', { name: 'Context', exact: true }).evaluate(n => n === document.activeElement), true)
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpectedRequests, [])
    const sheetFiles = await sheets(browser, samples)
    const files = ['desktop/plugin.js', 'tests/harness.mjs', 'tests/harness-theme.css', 'tests/themes.test.mjs', 'tests/fixtures/native-themes/runtime.mjs', 'tests/fixtures/native-themes/tokens.css']
    const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(resolve(root, file))).digest('hex')])))
    const report = { synthetic: true, nativeDesktop: false, paletteCount: palettes.length, themeCount: names.length, screenshotCount: samples.length, samples, sheetFiles, errors, unexpectedRequests, hashes, minimumTextContrast: Math.min(...samples.flatMap(s => s.metrics.text.map(t => t.contrast))) }
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`Theme review: ${names.length} built-ins / ${palettes.length} palettes / ${samples.length} popup PNGs / ${sheetFiles.length} sheets; minimum text contrast ${report.minimumTextContrast.toFixed(2)}:1. Gallery: ${output}/index.html`)
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
