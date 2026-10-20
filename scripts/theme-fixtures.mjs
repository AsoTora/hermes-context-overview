// Refresh portable test fixtures from the pinned, unmodified Hermes checkout.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const revision = 'd923a5eb487a17c0a68801bba9ef0f56c81040a8'
if (!process.argv[2]) throw new Error('Usage: pnpm fixtures:themes /path/to/pinned/hermes-agent')
const source = resolve(process.argv[2])
const target = resolve(import.meta.dirname, '../tests/fixtures/native-themes')
const files = ['apps/desktop/src/themes/presets.ts', 'apps/shared/src/theme-presets.ts', 'apps/desktop/src/themes/context.tsx', 'apps/desktop/src/themes/skin.ts', 'apps/desktop/src/themes/color.ts', 'apps/shared/src/color.ts', 'apps/desktop/src/styles.css']
const contents = new Map()
const provenance = { revision, license: 'MIT — Nous Research; see LICENSE', sources: [], seams: 'Native palette selection, light synthesis, applyTheme and CSS tokens. No Desktop stores, IPC, custom CSS, accent overrides, remote fonts or native window materials. SDK components remain synthetic.' }
for (const path of files) {
  const expected = execFileSync('git', ['show', `${revision}:${path}`], { cwd: source })
  const actual = await readFile(resolve(source, path))
  if (!actual.equals(expected)) throw new Error(`Source differs from pinned revision: ${path}`)
  contents.set(path, actual.toString())
  provenance.sources.push({ path, sha256: createHash('sha256').update(actual).digest('hex') })
}
const context = contents.get(files[2])
function section(start, end) {
  const a = context.indexOf(start), b = context.indexOf(end, a + start.length)
  if (a < 0 || b < 0) throw new Error(`Missing native boundary: ${start}`)
  return context.slice(a, b)
}
const declarations = [
  section('function synthLightColors(', '/** Returns the seed palette'),
  section('function paletteFor(', '// A backend skin'),
  section('function renderedModeFor(', '// ─── CSS application'),
  section('const NEUTRAL_CHROME =', '// The one foreground'),
  section('const PRIMARY_SOLID_FOREGROUND =', 'const TYPOGRAPHY_KNOB_VARS'),
  section('const TYPOGRAPHY_KNOB_VARS =', '// Pin Electron')
].join('\n')
// Only bindings to app stores/IPC/font preferences are replaced. The native
// implementation itself is copied verbatim, including all color calculations.
const entry = `import { ensureContrast, mix, parseColor } from '@hermes/shared/color';
import { harmonize, readableInk } from './color';
import { BUILTIN_THEME_LIST, DEFAULT_TYPOGRAPHY, nousTheme } from './presets';
const $chatFontFamily = { get: () => 'system' };
const resolveChatFontFamily = (_preference, fallback) => fallback;
const setAppearance = () => {};
const INJECTED_FONT_URLS = new Set(BUILTIN_THEME_LIST.map(theme => theme.typography?.fontUrl));
${declarations}
export const palettes = BUILTIN_THEME_LIST.flatMap(seed => ['light', 'dark'].map(mode => ({ name: seed.name, label: seed.label, mode, synthesized: mode === 'light' && !seed.darkColors, colors: paletteFor(seed, mode) })));
export function applyNativeTheme(name, mode) {
 const seed = BUILTIN_THEME_LIST.find(theme => theme.name === name);
 if (!seed || !['light','dark'].includes(mode)) throw new Error('Unknown fixture palette');
 applyTheme({ ...seed, name: name + '-' + mode, colors: paletteFor(seed, mode) }, mode);
}
`
await mkdir(target, { recursive: true })
const result = await build({ stdin: { contents: entry, resolveDir: resolve(source, 'apps/desktop/src/themes'), loader: 'ts' }, bundle: true, format: 'esm', platform: 'browser', write: false, alias: { '@hermes/shared/color': resolve(source, 'apps/shared/src/color.ts'), '@hermes/shared': resolve(source, 'apps/shared/src/theme-presets.ts') }, banner: { js: `// Generated native Hermes theme fixture. MIT, Nous Research. Revision ${revision}.\n// Refresh: pnpm fixtures:themes /path/to/pinned/hermes-agent` } })
await writeFile(resolve(target, 'runtime.mjs'), result.outputFiles[0].text.replaceAll(source + '/', 'hermes-agent/'))
const css = contents.get(files[6]).replace(/\/\*[\s\S]*?\*\//g, '')
const blocks = [':root', ':root.dark'].map(selector => {
 const escaped = selector.replaceAll('.', '\\.')
 const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]+)\\}`))
 if (!match) throw new Error(`Missing native CSS ${selector}`)
 const properties = match[1].match(/--[\w-]+\s*:[^;]+;/g)
 return `${selector}{\n${properties.join('\n')}\n}`
}).join('\n')
await writeFile(resolve(target, 'tokens.css'), `/* Generated native token declarations. MIT, Nous Research. ${revision}. */\n${blocks}\n`)
await writeFile(resolve(target, 'LICENSE'), execFileSync('git', ['show', `${revision}:LICENSE`], { cwd: source }))
await writeFile(resolve(target, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n')
console.log('Generated portable native palette runtime and CSS tokens from verified pinned sources.')
