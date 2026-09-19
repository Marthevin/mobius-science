import { describe, expect, it } from 'vitest'

import { APP } from '../../shared/app-config'
import { PRODUCT } from './product-config'

describe('Mobius Science product configuration', () => {
  it('defines the release identity and fixed execution policy in one immutable manifest', () => {
    expect(PRODUCT).toEqual({
      schemaVersion: 1,
      displayName: 'Mobius Science',
      developmentDisplayName: 'Mobius Science (DEV)',
      slug: 'mobius-science',
      appId: 'com.mobius.science',
      executableName: 'mobius-science',
      desktopName: 'mobius-science.desktop',
      cliCommand: 'mobius-science',
      configDirectory: '.mobius-science',
      developmentConfigDirectory: '.mobius-science-project',
      databaseFileName: 'mobius-science.db',
      legacyDatabaseFileNames: ['open-science.db'],
      dataDirectory: 'MobiusScience',
      developmentDataDirectory: 'MobiusScience-DEV',
      sessionExtension: 'mobius',
      sessionMimeType: 'application/x-mobius-science-session',
      copyright: '© 2026 Mobius Science',
      credentialStorageNames: ['Mobius Science', 'Open-Science', 'Open Science'],
      electronProfileNames: ['Mobius Science', 'Open Science', 'Open-Science'],
      agentFrameworkId: 'opencode',
      managedOpencodeVersion: '1.18.31',
      providerVendorId: 'deepseek',
      providerModel: 'deepseek-flash',
      updatesEnabled: false,
      upstreamLinksEnabled: false,
      upstreamMarketplacesEnabled: false,
      commandLineToolEnabled: false,
      opencodeExternalPluginsEnabled: false
    })
    expect(Object.isFrozen(PRODUCT)).toBe(true)
  })

  it('projects the shared application identity from the product manifest', () => {
    expect(APP.name).toBe(PRODUCT.displayName)
    expect(APP.copyright).toBe(PRODUCT.copyright)
  })
})
