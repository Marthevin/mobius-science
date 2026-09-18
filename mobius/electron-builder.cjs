/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-require-imports */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const { load } = require('js-yaml')

const root = join(__dirname, '..')

const readYaml = (path) => load(readFileSync(path, 'utf8'))

// electron-builder concatenates arrays while resolving `extends`. That is useful for generic file
// filters but unsafe for a downstream distribution: application associations and DMG contents from
// the parent remain visible. Resolve the two YAML files here with conventional overlay semantics,
// where an explicitly declared downstream array replaces its upstream counterpart.
const mergeOverlay = (base, overlay) => {
  if (Array.isArray(overlay)) return overlay.map((value) => structuredClone(value))
  if (!overlay || typeof overlay !== 'object') return overlay

  const result = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {}
  for (const [key, value] of Object.entries(overlay)) {
    result[key] = mergeOverlay(result[key], value)
  }
  return result
}

const base = readYaml(join(root, 'electron-builder.yml'))
const overlay = readYaml(join(__dirname, 'electron-builder.yml'))
delete overlay.extends

const config = mergeOverlay(base, overlay)
delete config.extends

// The base repeats its legacy .science association inside platform blocks. The downstream top-level
// association is authoritative for every platform, so remove those inherited platform overrides.
for (const platform of ['mac', 'win', 'linux']) {
  if (config[platform]) delete config[platform].fileAssociations
}

module.exports = config
