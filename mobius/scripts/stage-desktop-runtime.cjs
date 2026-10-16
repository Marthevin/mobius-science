/* eslint-disable @typescript-eslint/no-require-imports */
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const stageDesktopRuntime = require('../../build/stage-desktop-runtime.cjs')
module.exports = async (context) => {
  const { verifyStagedLocalNativeComponents } = await import(
    pathToFileURL(join(__dirname, 'local-native-components.mjs')).href
  )
  return stageDesktopRuntime({
    ...context,
    stageNativeComponents: () => verifyStagedLocalNativeComponents(context.packager.projectDir)
  })
}
