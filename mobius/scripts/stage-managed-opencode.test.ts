import { describe, expect, it } from 'vitest'

import { openCodeTarget } from './stage-managed-opencode.mjs'

describe('Mobius OpenCode staging target', () => {
  it('maps supported native targets to pinned package layouts', () => {
    expect(openCodeTarget('darwin', 'arm64')).toMatchObject({
      packageName: 'opencode-darwin-arm64',
      binName: 'opencode'
    })
    expect(openCodeTarget('win32', 'x64')).toMatchObject({
      packageName: 'opencode-windows-x64',
      binName: 'opencode.exe'
    })
  })
})
