import { describe, expect, it } from 'vitest'

import { createMobiusProviderFormValue } from './provider-default'

describe('Mobius provider default', () => {
  it('starts first-run setup on DeepSeek Flash', () => {
    expect(createMobiusProviderFormValue()).toMatchObject({
      type: 'official',
      vendorId: 'deepseek',
      model: 'deepseek-flash'
    })
  })
})
