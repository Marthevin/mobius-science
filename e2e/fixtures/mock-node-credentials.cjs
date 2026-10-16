'use strict'
/* eslint-disable @typescript-eslint/no-require-imports -- Explicit isolated E2E preload only. */
if (!process.versions.electron) {
  if (
    process.platform !== 'darwin' ||
    !process.env.OPEN_SCIENCE_E2E_STORAGE_ROOT ||
    (process.env.OPEN_SCIENCE_E2E_EXECUTABLE &&
      process.env.OPEN_SCIENCE_E2E_USE_MOCK_KEYCHAIN !== '1')
  )
    throw new Error('The Node credential fixture requires an isolated macOS mock-Keychain E2E run.')
  const { join, resolve } = require('node:path')
  const { createRequire } = require('node:module')
  // The packaged backend owns a different dependency tree from this source fixture. Resolve
  // from its entry so the replacement reaches its helper package without changing app bytes.
  const backendRequire = process.argv[1] ? createRequire(resolve(process.argv[1])) : require
  const probe = backendRequire('@aipoch/credential-identity-probe-native')
  probe.executablePath = join(__dirname, 'mock-credential-identity.sh')
  probe.secretExecutablePath = join(__dirname, 'mock-node-secret.sh')
}
