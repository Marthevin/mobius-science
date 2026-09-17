import { PRODUCT } from './product-config'

export const MOBIUS_CAPABILITIES = Object.freeze({
  automaticUpdates: PRODUCT.updatesEnabled,
  upstreamLinks: PRODUCT.upstreamLinksEnabled,
  upstreamMarketplaces: PRODUCT.upstreamMarketplacesEnabled,
  commandLineTool: PRODUCT.commandLineToolEnabled,
  opencodeExternalPlugins: PRODUCT.opencodeExternalPluginsEnabled,
  remoteRuntimeDownloads: false,
  agentSelection: false,
  managedAgentFramework: PRODUCT.agentFrameworkId
})
