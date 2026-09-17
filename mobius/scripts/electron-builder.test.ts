import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

describe('Mobius electron-builder overlay', () => {
  it('owns visible package identity, icons, Session association, and update policy', async () => {
    const config = load(
      await readFile(join(process.cwd(), 'mobius', 'electron-builder.yml'), 'utf8')
    ) as {
      extends?: string
      appId?: string
      productName?: string
      fileAssociations?: Array<{ ext?: string; mimeType?: string; name?: string }>
      win?: { executableName?: string; icon?: string; artifactName?: string }
      mac?: { icon?: string; artifactName?: string; extendInfo?: Record<string, string> }
      dmg?: { icon?: string; title?: string; contents?: Array<{ name?: string }> }
      linux?: { executableName?: string }
      publish?: unknown
    }

    // electron-builder resolves `extends` from the project directory, not from this YAML file.
    expect(config.extends).toBe('./electron-builder.yml')
    expect(config.appId).toBe('com.mobius.science')
    expect(config.productName).toBe('Mobius Science')
    expect(config.fileAssociations).toContainEqual(
      expect.objectContaining({
        ext: 'mobius',
        mimeType: 'application/x-mobius-science-session',
        name: 'Mobius Science Session package'
      })
    )
    expect(config.win).toMatchObject({
      executableName: 'mobius-science',
      icon: 'mobius/generated/app/icon.ico'
    })
    expect(config.mac).toMatchObject({
      icon: 'mobius/generated/app/icon.icon',
      extendInfo: {
        CFBundleName: 'Mobius Science',
        CFBundleDisplayName: 'Mobius Science'
      }
    })
    expect(config.dmg).toMatchObject({
      icon: 'mobius/generated/app/icon.icns',
      title: 'Mobius Science'
    })
    expect(config.dmg?.contents?.[0]?.name).toBe('Mobius Science.app')
    expect(config.linux?.executableName).toBe('mobius-science')
    expect(config.publish).toBeNull()
  })
})
