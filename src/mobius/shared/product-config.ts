import productManifest from '../../../mobius/config/product.json'

export type ProductConfig = Readonly<{
  schemaVersion: 1
  displayName: string
  developmentDisplayName: string
  slug: string
  appId: string
  executableName: string
  desktopName: string
  cliCommand: string
  configDirectory: string
  developmentConfigDirectory: string
  dataDirectory: string
  developmentDataDirectory: string
  sessionExtension: string
  sessionMimeType: string
  copyright: string
  credentialStorageNames: readonly [string, ...string[]]
  electronProfileNames: readonly [string, ...string[]]
  agentFrameworkId: 'opencode'
  managedOpencodeVersion: string
  providerVendorId: 'deepseek'
  providerModel: 'deepseek-flash'
  updatesEnabled: false
  upstreamLinksEnabled: false
  upstreamMarketplacesEnabled: false
  commandLineToolEnabled: false
  opencodeExternalPluginsEnabled: false
}>

const isProductConfig = (value: unknown): value is ProductConfig => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.schemaVersion === 1 &&
    candidate.agentFrameworkId === 'opencode' &&
    candidate.providerVendorId === 'deepseek' &&
    candidate.providerModel === 'deepseek-flash' &&
    candidate.updatesEnabled === false &&
    candidate.upstreamLinksEnabled === false &&
    candidate.upstreamMarketplacesEnabled === false &&
    candidate.commandLineToolEnabled === false &&
    candidate.opencodeExternalPluginsEnabled === false &&
    Array.isArray(candidate.credentialStorageNames) &&
    candidate.credentialStorageNames.length > 0 &&
    candidate.credentialStorageNames.every(
      (name) => typeof name === 'string' && name.trim().length > 0
    ) &&
    new Set(candidate.credentialStorageNames).size === candidate.credentialStorageNames.length &&
    candidate.credentialStorageNames[0] === candidate.displayName &&
    Array.isArray(candidate.electronProfileNames) &&
    candidate.electronProfileNames.length > 0 &&
    candidate.electronProfileNames.every(
      (name) => typeof name === 'string' && name.trim().length > 0
    ) &&
    new Set(candidate.electronProfileNames).size === candidate.electronProfileNames.length &&
    candidate.electronProfileNames[0] === candidate.displayName &&
    [
      'displayName',
      'developmentDisplayName',
      'slug',
      'appId',
      'executableName',
      'desktopName',
      'cliCommand',
      'configDirectory',
      'developmentConfigDirectory',
      'dataDirectory',
      'developmentDataDirectory',
      'sessionExtension',
      'sessionMimeType',
      'copyright',
      'managedOpencodeVersion'
    ].every((key) => typeof candidate[key] === 'string' && candidate[key].length > 0)
  )
}

if (!isProductConfig(productManifest)) {
  throw new Error('config/product.json does not satisfy the Mobius Science product contract.')
}

export const PRODUCT: ProductConfig = Object.freeze({
  ...productManifest,
  credentialStorageNames: Object.freeze([...productManifest.credentialStorageNames]) as readonly [
    string,
    ...string[]
  ],
  electronProfileNames: Object.freeze([...productManifest.electronProfileNames]) as readonly [
    string,
    ...string[]
  ]
})

export const PRODUCT_HTTP_USER_AGENT = 'MobiusScience/1.0'
export const PRODUCT_BROWSER_USER_AGENT = 'Mozilla/5.0 (compatible; MobiusScience/1.0)'
