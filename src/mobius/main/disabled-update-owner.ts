import { runtimeMetadata } from '../../main/runtime-metadata'

import type { UpdateCommandOwner } from '../../main/update/command-owner'
import type { UpdateStatus } from '../../shared/update'
import { PRODUCT } from '../shared/product-config'

const createDisabledUpdateCommandOwner = (): UpdateCommandOwner => {
  const status = (): UpdateStatus => ({ state: 'idle', current: runtimeMetadata().version })

  return {
    getAppInfo: () => ({
      name: PRODUCT.displayName,
      version: runtimeMetadata().version,
      copyright: PRODUCT.copyright
    }),
    getStatus: status,
    check: async () => status(),
    download: async () => status(),
    cancel: async () => status(),
    apply: async () => status()
  }
}

export { createDisabledUpdateCommandOwner }
