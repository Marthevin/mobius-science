import { describe, expect, it } from 'vitest'
import catalog from '../../main/notebook/windows-runtime-catalog.json'
import type { WindowsRuntimeComponentRelease } from '../../main/notebook/windows-runtime-components'

describe('Mobius Windows runtime CDN policy', () => {
  it('loads safely with downloads disabled and rejects upstream executable releases', async () => {
    const imported = import('../../main/notebook/windows-runtime-components')
    await expect(imported).resolves.toHaveProperty('assertWindowsRuntimeComponentRelease')
    const { assertWindowsRuntimeComponentRelease } = await imported
    for (const release of catalog.releases) {
      expect(() =>
        assertWindowsRuntimeComponentRelease(release as unknown as WindowsRuntimeComponentRelease)
      ).toThrow('Invalid Windows runtime component catalog entry')
    }
  })
})
