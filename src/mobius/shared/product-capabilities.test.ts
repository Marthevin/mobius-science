import { describe, expect, it } from 'vitest'

import { MOBIUS_CAPABILITIES } from './product-capabilities'

describe('Mobius distribution capabilities', () => {
  it('ships without upstream network surfaces or automatic updates', () => {
    expect(MOBIUS_CAPABILITIES).toMatchObject({
      automaticUpdates: false,
      upstreamLinks: false,
      upstreamMarketplaces: false,
      commandLineTool: false,
      opencodeExternalPlugins: false,
      agentSelection: false
    })
  })
})
