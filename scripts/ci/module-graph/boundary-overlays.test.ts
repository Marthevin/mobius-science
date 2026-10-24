import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { loadBoundaryPolicy } from './boundaries.mjs'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const fixture = (overlay: object): string => {
  const root = mkdtempSync(join(tmpdir(), 'module-boundary-overlay-'))
  roots.push(root)
  mkdirSync(join(root, 'scripts/ci'), { recursive: true })
  mkdirSync(join(root, 'downstream'), { recursive: true })
  const path = join(root, 'scripts/ci/module-boundaries.json')
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      overlays: ['downstream/boundaries.json'],
      fileLayers: { 'src/shared/contract.ts': 'shared-contract' },
      publicInterfaceOwners: ['feature'],
      modules: {
        feature: {
          sources: ['src/feature.ts'],
          layer: 'presentation-adapter',
          consumerModules: [],
          requiredTests: ['src/feature.test.ts'],
          resourceImports: ['resources/original.svg']
        },
        upstream: {
          sources: ['src/upstream.ts'],
          layer: 'host-owner',
          consumerModules: []
        }
      }
    })
  )
  writeFileSync(join(root, 'downstream/boundaries.json'), JSON.stringify(overlay))
  return path
}

it('adds exact downstream resource evidence while retaining the upstream boundary', () => {
  const policy = loadBoundaryPolicy(
    fixture({
      schemaVersion: 1,
      fileLayers: { 'src/downstream/brand.ts': 'shared-contract' },
      modules: {
        feature: {
          resourceImports: ['resources/downstream.svg'],
          resourceTests: ['src/downstream/brand.test.ts'],
          requiredTests: ['src/downstream/brand.test.ts']
        }
      }
    })
  )
  expect(policy.modules.feature).toEqual({
    sources: ['src/feature.ts'],
    layer: 'presentation-adapter',
    consumerModules: [],
    requiredTests: ['src/feature.test.ts', 'src/downstream/brand.test.ts'],
    resourceImports: ['resources/original.svg', 'resources/downstream.svg'],
    resourceTests: ['src/downstream/brand.test.ts']
  })
  expect(policy.fileLayers).toEqual({
    'src/shared/contract.ts': 'shared-contract',
    'src/downstream/brand.ts': 'shared-contract'
  })
  expect(policy.publicInterfaceOwners).toEqual(['feature'])
})

it.each([
  { fileLayers: { 'src/shared/contract.ts': 'presentation' }, modules: {} },
  { fileLayers: {}, modules: { feature: { layer: 'resource-or-tooling' } } },
  { fileLayers: {}, modules: { feature: { consumerModules: ['unreviewed'] } } },
  { fileLayers: {}, modules: { feature: { externalImports: ['node:child_process'] } } },
  { fileLayers: {}, modules: { unknown: { requiredTests: ['src/unknown.test.ts'] } } },
  { fileLayers: {}, modules: { constructor: { requiredTests: ['src/unknown.test.ts'] } } },
  { fileLayers: {}, modules: { feature: { requiredTests: [1] } } },
  {
    fileLayers: {},
    modules: {
      feature: {
        sources: ['src/shared/contract.ts'],
        sourceLayers: { 'src/shared/contract.ts': 'presentation-adapter' }
      }
    }
  },
  {
    fileLayers: {},
    modules: {
      feature: {
        sources: ['src/upstream.ts'],
        sourceLayers: { 'src/upstream.ts': 'presentation-adapter' }
      }
    }
  }
])('rejects conflicting or widening downstream policy %#', (overlay) => {
  expect(() => loadBoundaryPolicy(fixture({ schemaVersion: 1, ...overlay }))).toThrow(
    'Invalid module boundary policy'
  )
})
