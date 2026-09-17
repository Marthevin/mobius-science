import type { PostProcessorModule } from 'i18next'

import { PRODUCT } from './product-config'
import { SESSION_PACKAGE_EXTENSION } from './session-package-branding'

const PROTECTED_NAMES = ['Open Science Framework'] as const
const PROTECTED_TOKEN_PREFIX = '\u0000mobius-protected-name:'

export const applyMobiusProductBrand = (value: string): string => {
  let branded = value

  for (const [index, name] of PROTECTED_NAMES.entries()) {
    branded = branded.replaceAll(name, `${PROTECTED_TOKEN_PREFIX}${index}\u0000`)
  }

  branded = branded.replaceAll('Open-Science', PRODUCT.displayName)
  branded = branded.replaceAll('Open Science', PRODUCT.displayName)
  branded = branded.replaceAll('.science', SESSION_PACKAGE_EXTENSION)

  for (const [index, name] of PROTECTED_NAMES.entries()) {
    branded = branded.replaceAll(`${PROTECTED_TOKEN_PREFIX}${index}\u0000`, name)
  }

  return branded
}

export const mobiusProductBrandPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: 'mobiusProductBrand',
  process: applyMobiusProductBrand
}
