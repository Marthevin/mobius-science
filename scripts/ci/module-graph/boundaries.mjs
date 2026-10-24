/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Reviewed boundary policy is data, but trusted data: it lives outside the candidate-editable
// registration shards and remains CODEOWNERS-protected. Keep this reader dependency-free so
// trusted preflight can load it without installed packages.
export const boundaryPolicyPath = 'scripts/ci/module-boundaries.json'

const stringList = (value) =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')
const stringMap = (value, check) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every(check)
const boundaryFields = {
  note: (value) => typeof value === 'string',
  sources: stringList,
  layer: (value) => typeof value === 'string',
  sourceLayers: (value) => stringMap(value, (layer) => typeof layer === 'string'),
  consumerModules: stringList,
  requiredTests: stringList,
  externalImports: stringList,
  resourcePaths: stringList,
  resourceImports: stringList,
  resourceTests: stringList,
  literalLoaders: (value) => value === true,
  pureExternalImports: (value) => stringMap(value, stringList)
}

export function validateBoundaryPolicy(policy) {
  const fail = (message) => {
    throw Error(`Invalid module boundary policy: ${message}`)
  }
  if (
    !policy ||
    policy.schemaVersion !== 1 ||
    Object.keys(policy).some(
      (key) =>
        !['schemaVersion', 'fileLayers', 'publicInterfaceOwners', 'modules', 'overlays'].includes(
          key
        )
    )
  )
    fail('unexpected top-level shape')
  if (!stringMap(policy.fileLayers, (layer) => typeof layer === 'string')) fail('fileLayers')
  if (
    policy.overlays !== undefined &&
    (!stringList(policy.overlays) ||
      policy.overlays.some(
        (path) =>
          !path.endsWith('.json') ||
          path.includes('\\') ||
          path.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
          /^[A-Za-z]:/.test(path)
      ))
  )
    fail('overlays must be repository-relative JSON paths')
  if (!stringList(policy.publicInterfaceOwners)) fail('publicInterfaceOwners')
  if (!stringMap(policy.modules, (entry) => entry && typeof entry === 'object')) fail('modules')
  for (const [id, boundary] of Object.entries(policy.modules)) {
    for (const [key, value] of Object.entries(boundary))
      if (!boundaryFields[key]?.(value)) fail(`${id}.${key}`)
    if (!boundary.sources || !boundary.consumerModules) fail(`${id} requires sources and consumers`)
  }
  return policy
}

// Trusted overlays may add exact evidence, never replace an upstream role or widen loading policy.
export function loadBoundaryPolicy(path = new URL('../module-boundaries.json', import.meta.url)) {
  const file = path instanceof URL ? fileURLToPath(path) : path
  const read = (path) => {
    if (!lstatSync(path).isFile())
      throw Error('Invalid module boundary policy: policy inputs must be regular files')
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  const policy = validateBoundaryPolicy(read(file))
  const fail = (message) => {
    throw Error(`Invalid module boundary policy: ${message}`)
  }
  const additiveFields = new Set([
    'sources',
    'requiredTests',
    'resourcePaths',
    'resourceImports',
    'resourceTests'
  ])
  for (const name of policy.overlays ?? []) {
    const overlay = read(resolve(dirname(file), '../..', name))
    if (
      !overlay ||
      overlay.schemaVersion !== 1 ||
      Object.keys(overlay).some(
        (key) => !['schemaVersion', 'fileLayers', 'modules'].includes(key)
      ) ||
      !stringMap(overlay.fileLayers, (layer) => typeof layer === 'string') ||
      !stringMap(overlay.modules, (entry) => entry && typeof entry === 'object')
    )
      fail(`invalid overlay ${name}`)
    const sourceOwners = new Map()
    const roles = new Map(Object.entries(policy.fileLayers))
    for (const [id, boundary] of Object.entries(policy.modules)) {
      for (const source of boundary.sources) {
        if (sourceOwners.has(source)) continue
        sourceOwners.set(source, id)
        const layer = boundary.sourceLayers?.[source] ?? boundary.layer ?? roles.get(source)
        if (layer) roles.set(source, layer)
      }
    }
    for (const [path, layer] of Object.entries(overlay.fileLayers)) {
      if (roles.has(path) && roles.get(path) !== layer) fail(`conflicting file layer for ${path}`)
      policy.fileLayers[path] = layer
      roles.set(path, layer)
    }
    for (const [id, additions] of Object.entries(overlay.modules)) {
      if (!Object.hasOwn(policy.modules, id)) fail(`overlay names unknown boundary ${id}`)
      const boundary = policy.modules[id]
      const originalSources = new Set(boundary.sources)
      if (additions.sources !== undefined && !stringList(additions.sources)) fail(`${id}.sources`)
      for (const source of additions.sources ?? []) {
        const layer = additions.sourceLayers?.[source] ?? boundary.layer
        if (
          (sourceOwners.has(source) && sourceOwners.get(source) !== id) ||
          (roles.has(source) && roles.get(source) !== layer)
        )
          fail(`conflicting source role for ${source}`)
        sourceOwners.set(source, id)
        if (layer) roles.set(source, layer)
      }
      for (const [key, value] of Object.entries(additions)) {
        if (key === 'sourceLayers') {
          if (!boundaryFields.sourceLayers(value)) fail(`${id}.${key}`)
          for (const [source, layer] of Object.entries(value)) {
            if (
              !additions.sources?.includes(source) ||
              (originalSources.has(source) && boundary.sourceLayers?.[source] !== layer)
            )
              fail(`conflicting source layer for ${source}`)
          }
          boundary.sourceLayers = { ...boundary.sourceLayers, ...value }
        } else {
          if (!additiveFields.has(key) || !stringList(value)) fail(`${id}.${key}`)
          boundary[key] = [...new Set([...(boundary[key] ?? []), ...value])]
        }
      }
    }
  }
  return validateBoundaryPolicy(policy)
}

const policy = loadBoundaryPolicy()

export const reviewedBoundaries = policy.modules
export const publicInterfaceOwners = policy.publicInterfaceOwners

// A file's reviewed role: its boundary's per-file override, the boundary layer, then a
// supporting-file entry. Unreviewed files fall back to path conventions in layers.mjs.
export function reviewedFileLayer(path) {
  const boundary = Object.values(reviewedBoundaries).find((entry) => entry.sources.includes(path))
  return boundary?.sourceLayers?.[path] ?? boundary?.layer ?? policy.fileLayers[path]
}

export function usesReviewedBoundary(id, module) {
  const boundary = reviewedBoundaries[id]
  if (!boundary || !module || module.fullTestReason) return false
  const paths = module.ownerPaths.filter((path) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path))
  const resources = boundary.resourcePaths ?? []
  const reviewed = [...boundary.sources, ...resources]
  return (
    new Set(reviewed).size === reviewed.length &&
    resources.every((path) => !/\.(?:[cm]?[jt]sx?|json)$/.test(path)) &&
    paths.length === reviewed.length &&
    reviewed.every((path) => paths.includes(path)) &&
    (module.consumerModules ?? []).every((id) => boundary.consumerModules.includes(id))
  )
}
