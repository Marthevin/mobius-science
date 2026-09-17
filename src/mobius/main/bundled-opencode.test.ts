import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveBundledOpenCodeDir } from './bundled-opencode'

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
