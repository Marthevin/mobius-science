import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveBundledOpenCodeDir } from './bundled-opencode'

const host = vi.hoisted(() => ({ resourcesPath: undefined as string | undefined }))
vi.mock('../../main/runtime-metadata', () => ({
  runtimeMetadataIfConfigured: () =>
    host.resourcesPath ? { resourcesPath: host.resourcesPath } : undefined
}))
afterEach(() => {
  host.resourcesPath = undefined
})

describe('bundled OpenCode resolution', () => {
  it('prefers the packaged resources directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'mobius-opencode-'))
    const packaged = join(root, 'managed-runtimes', 'opencode')
    mkdirSync(packaged, { recursive: true })

    expect(resolveBundledOpenCodeDir({ resourcesPath: root, workspaceRoot: '/missing' })).toBe(
      packaged
    )
  })
})

it('resolves packaged resources from the ordinary Node host metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'mobius-node-resources-'))
  const packaged = join(root, 'backend/resources/managed-runtimes/opencode')
  mkdirSync(packaged, { recursive: true })
  host.resourcesPath = join(root, 'backend/resources')
  expect(resolveBundledOpenCodeDir({ workspaceRoot: '/missing' })).toBe(packaged)
})

it('finds the desktop pinned runtime beside the Node backend resources', () => {
  const root = mkdtempSync(join(tmpdir(), 'mobius-desktop-runtime-'))
  const packaged = join(root, 'managed-runtimes/opencode')
  mkdirSync(packaged, { recursive: true })
  host.resourcesPath = join(root, 'backend/resources')
  expect(resolveBundledOpenCodeDir({ workspaceRoot: '/missing' })).toBe(packaged)
})
