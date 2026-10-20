import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import plugin, { normalize } from '../desktop/plugin.js'
import { host } from './sdk.mjs'
import { example } from './example.mjs'

test('actual entry registers only a new bottom status-bar render item, no composer/page/titlebar/nav/palette', () => {
  const values = []
  plugin.register({ register: value => values.push(value), onDispose: fn => fn() })
  assert.equal(plugin.id, 'hermes-context-overview')
  assert.equal(plugin.defaultEnabled, true)
  assert.equal(values.length, 1)
  assert.equal(values[0].area, 'statusBar.right')
  assert.equal(typeof values[0].render().type, 'function')
  assert.equal(host.lastPath, undefined)
})
test('authoritative occupancy conserves free budget independently of estimates', () => {
  const value = normalize(example)
  assert.equal(value.used, 46080)
  assert.equal(value.free, 81920)
  assert.equal(value.occupiedCells, 36)
  assert.equal(value.sum, 43520)
  assert.notEqual(value.sum, value.used)
  assert.equal(value.used + value.free, value.max)
  assert.equal(value.sourceLabel, 'Provider-reported occupancy')
})
test('100-cell rounding is proportional, bounded, and zero conversation is preserved', () => {
  for (let used = 0; used <= 2000; used++) {
    const value = normalize({ ...example, context_max: 1000, context_used: used, categories: [{ id: 'conversation', label: 'Conversation', tokens: 0 }] })
    assert.equal(value.occupiedCells, Math.min(100, Math.round(used / 1000 * 100)))
    assert.equal(value.free, Math.max(0, 1000 - used))
    assert.equal(value.categories[0].tokens, 0)
    assert.ok(value.occupiedCells >= 0 && value.occupiedCells <= 100)
  }
})
test('malformed numeric inputs are not coerced into budget claims', () => {
  for (const bad of [NaN, Infinity, -1, 1.5, '128000', false, null, undefined, {}, Number.MAX_VALUE]) {
    const value = normalize({ ...example, context_used: bad })
    assert.equal(value.known, false)
    assert.equal(value.free, null)
    assert.equal(value.used, null)
  }
  assert.equal(normalize({ ...example, context_max: 0 }).known, false)
  assert.equal(normalize({ ...example, context_max: -1 }).known, false)
  assert.throws(() => normalize(null), /missing-data/)
  assert.throws(() => normalize([]), /missing-data/)
})
test('invalid categories omitted, unknown identifiers safe, Unicode preserved, no arbitrary CSS', () => {
  const value = normalize({ ...example, categories: [{ id: 'memory', label: '記憶 · Память', tokens: 0, color: 'url(https://invalid.test/leak)' }, { tokens: -1 }, null, { id: 'new-kind', label: '<script>text</script>', tokens: 12 }] })
  assert.equal(value.categories.length, 2)
  assert.equal(value.categories[0].label, '記憶 · Память')
  assert.equal(value.categories[1].label, '<script>text</script>')
  assert.equal('color' in value.categories[0], false)
  assert.ok(value.issues.some(item => /Malformed/.test(item)))
})
test('metadata projection ignores raw content and flags oversized sums', () => {
  const value = normalize({ ...example, prompt: 'RAW_SECRET', categories: [{ id: 'a', tokens: Number.MAX_SAFE_INTEGER }, { id: 'b', tokens: 1 }], context_files: [{ label: 'Rules', path: '/demo/rules.md', loaded: 'true', chars: '12', est_tokens: Infinity, content: 'RAW_SECRET' }] })
  assert.equal(value.sum, null)
  assert.equal(value.files[0].loaded, 'Unknown')
  assert.equal(value.files[0].chars, null)
  assert.equal(JSON.stringify(value).includes('RAW_SECRET'), false)
})
test('missing arrays, unknown provenance and contradictory estimate totals are explicit', () => {
  const value = normalize({ context_max: 100, context_used: 50, estimated_total: 20 })
  assert.deepEqual(value.categories, [])
  assert.deepEqual(value.files, [])
  assert.equal(value.source, 'unknown')
  assert.equal(value.sum, null)
  assert.ok(value.issues.some(item => /provenance/.test(item)))
  assert.ok(normalize({ ...example, estimated_total: 1 }).issues.some(item => /differs/.test(item)))
})
test('runtime source has only SDK/React imports and no external collectors or filesystem surface', async () => {
  const source = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
  assert.deepEqual([...source.matchAll(/from '([^']+)'/g)].map(match => match[1]), ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
  for (const forbidden of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\s*\(/, /\bsetInterval\s*\(/, /document\./, /localStorage/, /config\.get/, /message\.list/, /session\.history/, /ctx\.rest/]) assert.doesNotMatch(source, forbidden)
})
