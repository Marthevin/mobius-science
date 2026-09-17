import { PRODUCT } from './product-config'

const SESSION_PACKAGE_EXTENSION = `.${PRODUCT.sessionExtension}`
const LEGACY_SESSION_PACKAGE_EXTENSION = '.science'
const SESSION_PACKAGE_DIALOG_EXTENSIONS = Object.freeze([
  PRODUCT.sessionExtension,
  LEGACY_SESSION_PACKAGE_EXTENSION.slice(1)
])
const SESSION_PACKAGE_FILE_PATTERN = new RegExp(
  `\\.(?:${PRODUCT.sessionExtension}|${LEGACY_SESSION_PACKAGE_EXTENSION.slice(1)})$`,
  'i'
)

const isSessionPackagePath = (path: string): boolean => SESSION_PACKAGE_FILE_PATTERN.test(path)

export {
  LEGACY_SESSION_PACKAGE_EXTENSION,
  SESSION_PACKAGE_DIALOG_EXTENSIONS,
  SESSION_PACKAGE_EXTENSION,
  SESSION_PACKAGE_FILE_PATTERN,
  isSessionPackagePath
}
