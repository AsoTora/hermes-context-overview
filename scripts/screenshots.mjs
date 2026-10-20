// Regenerates the public README/catalog screenshots from the real plugin entry
// rendered with demo data. Usage: pnpm screenshots:docs
import './../tests/setup.mjs'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const work = resolve(root, '.local/docs-screenshots')
const out = resolve(root, 'docs/screenshots')
const themes = ['nous', 'nous-alt', 'classic', 'github', 'catppuccin', 'everforest', 'solarized', 'midnight', 'ember', 'mono', 'slate', 'cyberpunk']
const model = 'hermes-4-405b'

await mkdir(work, { recursive: true })
await build({ entryPoints: [resolve(root, 'tests/harness.mjs')], bundle: true, format: 'esm', outfile: resolve(work, 'harness.js'), alias: { '@hermes/plugin-sdk': resolve(root, 'tests/sdk.mjs') }, logLevel: 'silent' })
const server = createServer(async (request, response) => {
  if (['/harness.js', '/harness.css'].includes(request.url)) {
    response.setHeader('Content-Type', request.url.endsWith('css') ? 'text/css' : 'text/javascript')
    response.end(await readFile(resolve(work, request.url.slice(1))))
  } else {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Context Overview</title><link rel="stylesheet" href="/harness.css"></head><body><div id="app"></div><script type="module" src="/harness.js"></script></body></html>')
  }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })

async function open(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
  await page.goto(origin)
  await page.evaluate(model => {
    window.harness.setResponse({ ...window.harness.example, model })
    const relabel = (from, to) => { for (const node of document.querySelectorAll('span')) if (node.textContent === from) node.textContent = to }
    relabel('Synthetic status bar', 'Connected')
    relabel('Demo model', model)
    // Ordinary-looking local profile and session id instead of fixture names.
    window.harness.setState('profile', 'default')
    window.harness.setState('focusedSessionProfile', 'default')
    window.harness.scopes.second = { session: '20261020_142233_8f1c', owner: { connectionId: 'demo-connection', profile: 'default' } }
  }, model)
  await page.getByRole('textbox', { name: 'Message conversation 2' }).focus()
  await page.getByRole('button', { name: 'Context', exact: true }).click()
  await page.getByText('Estimated allocation', { exact: true }).waitFor()
  return page
}

try {
  // Hero: the popover in place above the status bar, light and dark.
  for (const mode of ['dark', 'light']) {
    const page = await open({ width: 1280, height: 780 })
    await page.evaluate(mode => window.harness.applyNativeTheme('nous', mode), mode)
    await page.waitForTimeout(150)
    await page.screenshot({ path: resolve(out, `overview-${mode}.png`) })
    await page.close()
  }
  // Theme gallery: every built-in theme, one sheet per mode.
  const page = await open({ width: 1180, height: 900 })
  for (const mode of ['dark', 'light']) {
    const shots = []
    for (const name of themes) {
      await page.evaluate(({ name, mode }) => window.harness.applyNativeTheme(name, mode), { name, mode })
      await page.waitForTimeout(80)
      const label = await page.evaluate(name => window.harness.palettes.find(p => p.name === name).label, name)
      const png = await page.getByRole('dialog').screenshot()
      shots.push({ label, data: png.toString('base64') })
    }
    const bg = mode === 'dark' ? 'radial-gradient(circle at 20% 0%,#2a2f45,#121420 60%)' : 'radial-gradient(circle at 20% 0%,#ffffff,#e7e9f0 60%)'
    const fg = mode === 'dark' ? '#e8e9f0' : '#1d1f29'
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
    await sheet.setContent(`<style>body{margin:0;padding:48px 56px 56px;background:${bg};color:${fg};font:15px -apple-system,BlinkMacSystemFont,"Inter",system-ui,sans-serif}h1{font-size:30px;font-weight:650;margin:0 0 6px;letter-spacing:-.01em}p{margin:0 0 36px;opacity:.7;font-size:16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:36px 28px}figure{margin:0}figcaption{font-weight:600;margin:0 0 10px;font-size:15px}img{width:100%;display:block;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,${mode === 'dark' ? '.45' : '.14'})}</style><h1>Context Overview</h1><p>Every built-in Hermes theme · ${mode === 'dark' ? 'Dark' : 'Light'} mode</p><div class="grid">${shots.map(s => `<figure><figcaption>${s.label}</figcaption><img src="data:image/png;base64,${s.data}"></figure>`).join('')}</div>`)
    await sheet.evaluate(() => Promise.all([...document.images].map(img => img.decode())))
    await sheet.screenshot({ path: resolve(out, `themes-${mode}.png`), fullPage: true })
    await sheet.close()
  }
  await page.close()
} finally {
  await browser.close()
  server.close()
  await rm(work, { recursive: true, force: true })
}
console.log('wrote overview-{dark,light}.png and themes-{dark,light}.png to docs/screenshots')
