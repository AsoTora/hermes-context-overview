import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalize } from '../desktop/plugin.js'
import { example } from './example.mjs'
import { lineageOverflow } from './fixtures/lineage-overflow.mjs'

test('lineage-shaped overflow preserves independent raw counts and provider provenance', () => {
  const value = normalize(lineageOverflow)
  assert.equal(value.allocationWarning, 'overflow')
  assert.deepEqual(value.categories.map(row => row.tokens), [23101, 786899])
  assert.equal(value.estimate, 810000)
  assert.equal(value.sum, 810000)
  assert.equal(value.used, 121137)
  assert.equal(value.free, 378863)
  assert.equal(value.occupiedCells, 24)
  assert.equal(value.sourceLabel, 'Provider-reported occupancy')
})
test('ordinary estimate differences do not raise the severe mismatch warning', () => {
  assert.equal(normalize(example).allocationWarning, null)
  assert.equal(normalize({ ...example, categories: [] , estimated_total: 46080 }).allocationWarning, null)
})
test('severe mismatch in either direction uses both a 2x ratio and 10% window floor', () => {
  const base = { context_max: 1000, context_used: 200, context_source: 'provider_usage' }
  for (const [used, tokens, expected] of [[200,400,'mismatch'], [400,200,'mismatch'], [200,399,null], [49,98,null], [0,100,'mismatch'], [100,0,'mismatch'], [0,0,null]]) {
    assert.equal(normalize({ ...base, context_used: used, categories: [{ tokens }] }).allocationWarning, expected)
  }
  assert.equal(normalize({ ...base, estimated_total: 400 }).allocationWarning, 'mismatch')
})
test('overflow remains visible with invalid occupancy, contradictory totals and unsafe sums', () => {
  const base = { context_max: 1000, context_used: null }
  assert.equal(normalize({ ...base, categories: [{ tokens: 1001 }] }).allocationWarning, 'overflow')
  assert.equal(normalize({ ...base, estimated_total: 1001 }).allocationWarning, 'overflow')
  assert.equal(normalize({ ...base, categories: [{ tokens: 600 }, { tokens: 600 }] }).allocationWarning, 'overflow')
  const huge = normalize({ ...base, categories: [{ tokens: Number.MAX_SAFE_INTEGER }, { tokens: 1 }] })
  assert.equal(huge.sum, null)
  assert.equal(huge.allocationWarning, 'overflow')
  assert.equal(normalize({ ...base, context_max: 0, estimated_total: 1001 }).allocationWarning, null)
  assert.equal(normalize({ ...base, categories: [{ tokens: -1 }] }).allocationWarning, null)
  assert.equal(normalize({ ...base, context_used: 200, categories: [{ tokens: 200 }], estimated_total: 1001 }).allocationWarning, 'overflow')
})
