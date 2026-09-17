import { describe, expect, it } from 'vitest'

import { allowMobiusMultiInstance } from './single-instance-isolation'

describe('allowMobiusMultiInstance', () => {
  it('allows explicitly requested development instances', () => {
    expect(
      allowMobiusMultiInstance({
        isPackaged: false,
        allowMultiInstance: '1',
        e2eStorageRoot: undefined,
        userDataOverride: undefined
      })
    ).toBe(true)
  })

  it('allows packaged certification only with absolute isolated roots', () => {
    expect(
      allowMobiusMultiInstance({
        isPackaged: true,
        allowMultiInstance: '1',
        e2eStorageRoot: '/tmp/mobius-certification/storage',
        userDataOverride: '/tmp/mobius-certification/user-data'
      })
    ).toBe(true)
  })

  it.each([
    [undefined, '/tmp/mobius-certification/user-data'],
    ['/tmp/mobius-certification/storage', undefined],
    ['relative/storage', '/tmp/mobius-certification/user-data'],
    ['/tmp/mobius-certification/storage', 'relative/user-data']
  ])('rejects packaged instances without two absolute isolated roots', (storage, userData) => {
    expect(
      allowMobiusMultiInstance({
        isPackaged: true,
        allowMultiInstance: '1',
        e2eStorageRoot: storage,
        userDataOverride: userData
      })
    ).toBe(false)
  })

  it('keeps the lock when multi-instance mode is not requested', () => {
    expect(
      allowMobiusMultiInstance({
        isPackaged: false,
        allowMultiInstance: undefined,
        e2eStorageRoot: '/tmp/mobius-certification/storage',
        userDataOverride: '/tmp/mobius-certification/user-data'
      })
    ).toBe(false)
  })
})
