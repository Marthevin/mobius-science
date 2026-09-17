import { describe, expect, it } from 'vitest'

import { runtimeTarget } from './stage-managed-runtimes.mjs'

describe('Mobius managed runtime target', () => {
  it('maps package platforms to conda and builder coordinates', () => {
    expect(runtimeTarget('darwin', 'arm64')).toEqual({
      subdir: 'osx-arm64',
      os: 'mac',
      arch: 'arm64',
      bin: 'micromamba'
    })
    expect(runtimeTarget('win32', 'x64')).toEqual({
      subdir: 'win-64',
      os: 'win',
      arch: 'x64',
      bin: 'micromamba.exe'
    })
  })
})
