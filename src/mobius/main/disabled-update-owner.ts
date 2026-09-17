import { app } from 'electron'

import type { UpdateCommandOwner } from '../../main/update/ipc'
import type { UpdateStatus } from '../../shared/update'
import { PRODUCT } from '../shared/product-config'

const createDisabledUpdateCommandOwner = (): UpdateCommandOwner => {
  const status = (): UpdateStatus => ({ state: 'idle', current: app.getVersion() })

  return {
    getAppInfo: () => ({
      name: PRODUCT.displayName,
      version: app.getVersion(),
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
