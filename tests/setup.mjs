import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= fileURLToPath(new URL('../node_modules/.cache/ms-playwright', import.meta.url))
register('./loader.mjs', import.meta.url)
