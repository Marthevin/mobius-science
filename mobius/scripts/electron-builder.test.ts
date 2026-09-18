import { createRequire } from 'node:module'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

describe('Mobius electron-builder resolved configuration', () => {
  it('owns visible package identity, icons, Session association, and update policy', () => {
    const configPath = join(process.cwd(), 'mobius', 'electron-builder.cjs')
    delete require.cache[require.resolve(configPath)]
    const config = require(configPath) as {
      appId?: string
      productName?: string
      fileAssociations?: Array<{ ext?: string; mimeType?: string; name?: string }>
      win?: {
        executableName?: string
        icon?: string
        artifactName?: string
        fileAssociations?: unknown[]
      }
      mac?: {
        icon?: string
        artifactName?: string
        extendInfo?: Record<string, string>
        fileAssociations?: unknown[]
      }
      dmg?: {
        background?: string
        icon?: string
        title?: string
        contents?: Array<{ name?: string; type?: string }>
      }
      linux?: { executableName?: string; fileAssociations?: unknown[] }
      publish?: unknown
    }

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
      background: 'mobius/generated/app/dmg-background.png',
      icon: 'mobius/generated/app/icon.icns',
      title: 'Mobius Science'
    })
    expect(config.dmg?.contents).toEqual([
      expect.objectContaining({ name: 'Mobius Science.app' }),
      expect.objectContaining({ type: 'link' })
    ])
    expect(config.dmg?.contents).not.toContainEqual(
      expect.objectContaining({ name: 'Open-Science.app' })
    )
    expect(config.mac?.fileAssociations).toBeUndefined()
    expect(config.win?.fileAssociations).toBeUndefined()
    expect(config.linux?.fileAssociations).toBeUndefined()
    expect(config.linux?.executableName).toBe('mobius-science')
    expect(config.publish).toBeNull()
  })
})
