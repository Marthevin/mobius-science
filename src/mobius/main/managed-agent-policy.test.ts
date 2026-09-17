import { describe, expect, it } from 'vitest'

import { DEFAULT_AGENT_FRAMEWORK_ID } from '../../main/agent-framework/registry'
import { MOBIUS_CAPABILITIES } from '../shared/product-capabilities'

describe('Mobius managed agent policy', () => {
  it('uses the managed OpenCode runtime as the only product default', () => {
    expect(MOBIUS_CAPABILITIES.agentSelection).toBe(false)
    expect(DEFAULT_AGENT_FRAMEWORK_ID).toBe('opencode')
    expect(MOBIUS_CAPABILITIES.managedAgentFramework).toBe('opencode')
  })
})
