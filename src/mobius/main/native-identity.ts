import { PRODUCT } from '../shared/product-config'

export const MOBIUS_NATIVE_IDENTITY = Object.freeze({
  name: PRODUCT.displayName,
  developmentName: PRODUCT.developmentDisplayName,
  appUserModelId: PRODUCT.appId,
  credentialStorageNames: PRODUCT.credentialStorageNames,
  electronProfileNames: PRODUCT.electronProfileNames
})
