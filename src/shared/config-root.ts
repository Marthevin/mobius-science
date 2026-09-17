import { join } from 'node:path'

import { PRODUCT } from '../mobius/shared/product-config'
import { resolveConfigRootOverride as resolveBaseConfigRootOverride } from '../../packages/notebook-network-sandbox/src/config-root'

// Keep the upstream resolver's environment contract while projecting the established Mobius
// directories. Explicit overrides remain authoritative, and legacy discovery remains in the
// storage owners that can validate data before adopting a path.
export const PROD_SESSION_DIR_NAME = PRODUCT.configDirectory
export const DEV_SESSION_DIR_NAME = PRODUCT.developmentConfigDirectory
export const resolveConfigRootOverride = resolveBaseConfigRootOverride

export const resolveBootstrapConfigRoot = (
  home: string | (() => string),
  packaged: boolean,
  env: NodeJS.ProcessEnv = process.env
): string =>
  resolveConfigRootOverride(packaged, env) ??
  join(
    typeof home === 'function' ? home() : home,
    packaged ? PROD_SESSION_DIR_NAME : DEV_SESSION_DIR_NAME
  )
