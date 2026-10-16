/* eslint-disable @typescript-eslint/no-require-imports */
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const signWindows = require('../../build/sign-windows.cjs').default
exports.default = async (context) => {
  if (context.electronPlatformName !== 'darwin') return signWindows(context)
  const { verifyPackagedLocalNativeComponents } = await import(
    pathToFileURL(join(__dirname, 'local-native-components.mjs')).href
  )
  return signWindows({
    ...context,
    verifyNativeComponents: (resources, target) =>
      verifyPackagedLocalNativeComponents(resources, target, context.packager.projectDir)
  })
}
