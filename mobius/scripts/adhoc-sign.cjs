/* eslint-disable @typescript-eslint/no-require-imports */
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const adhocSign = require('../../build/adhoc-sign.cjs').default
exports.default = async (context) => {
  const { verifyPackagedLocalNativeComponents } = await import(
    pathToFileURL(join(__dirname, 'local-native-components.mjs')).href
  )
  return adhocSign({
    ...context,
    verifyNativeComponents: (resources, target) =>
      verifyPackagedLocalNativeComponents(resources, target, context.packager.projectDir)
  })
}
