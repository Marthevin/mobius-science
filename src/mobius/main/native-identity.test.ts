import { describe, expect, it } from 'vitest'

import { PRODUCT } from '../shared/product-config'
import { MOBIUS_NATIVE_IDENTITY } from './native-identity'

describe('Mobius native identity', () => {
  it('projects the product manifest into Electron process identity', () => {
    expect(MOBIUS_NATIVE_IDENTITY).toEqual({
      name: PRODUCT.displayName,
      developmentName: PRODUCT.developmentDisplayName,
      appUserModelId: PRODUCT.appId
    })
  })
})
