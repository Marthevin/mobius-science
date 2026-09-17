import { createEmptyProviderFormValue } from '@/pages/settings/provider-form-value'

import { PRODUCT } from '../shared/product-config'

export const createMobiusProviderFormValue = (): ReturnType<typeof createEmptyProviderFormValue> =>
  createEmptyProviderFormValue({
    type: 'official',
    vendorId: PRODUCT.providerVendorId,
    model: PRODUCT.providerModel
  })
