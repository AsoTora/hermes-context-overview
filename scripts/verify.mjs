// Local verification receipt. Does not install/enable the plugin or alter Hermes.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const local = resolve(root, '.local')
await mkdir(local, { recursive: true })
const commands = [
  ['node', ['--check', 'desktop/plugin.js'], 'final-node-check.log'],
  ['pnpm', ['test'], 'final-tests.log'],
  ['hermes', ['plugins', 'doctor', '--ci', '.'], 'final-doctor.log'],
  ['hermes', ['plugins', 'validate', '.', '--install-deps'], 'final-validate.log']
]
const results = []
for (const [command, args, log] of commands) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 180000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`
  await writeFile(resolve(local, log), output)
  const knownDoctorLimitation = command === 'hermes' && args.includes('doctor') && result.status === 1 && output.includes('No __init__.py')
  results.push({ command: [command, ...args].join(' '), exitCode: result.status, log: `.local/${log}`, sha256: createHash('sha256').update(output).digest('hex'), ...(knownDoctorLimitation ? { limitation: 'Doctor requires Python registration for this Desktop-only package; not a passed doctor check.' } : {}) })
}
const files = []
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.local', '.git'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await inventory(path)
    else if (entry.isFile()) { const value = await readFile(path); files.push({ path: relative(root, path), bytes: value.length, sha256: createHash('sha256').update(value).digest('hex') }) }
  }
}
await inventory(root)
files.sort((a, b) => a.path.localeCompare(b.path))
const receipt = { generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, runtimeReference: 'd923a5eb487a17c0a68801bba9ef0f56c81040a8', evidenceLevel: 'Actual composer contribution with synthetic SDK/focus routing + real React/Query/Radix + Chromium; live Desktop unknown', commands: results, files }
await writeFile(resolve(local, 'evidence.json'), `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify({ commands: results, receipt: '.local/evidence.json', publishableFiles: files.length }, null, 2))
if (results.some(result => result.exitCode !== 0)) process.exitCode = 1
