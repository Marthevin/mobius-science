/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { lstat, readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const contract = {
  postinstall:
    'node scripts/prepare-shadcn-patch.mjs && patch-package --error-on-fail && node scripts/check-claude-acp-patch.mjs && prisma generate && install-electron && node scripts/install-native-components.mjs && node scripts/fix-electron-path.cjs && npm run build:packages',
  build:
    'npm run build:packages -- --clean && npm run typecheck:compiled && npm run build:backend:compiled && electron-vite build && npm run build:web:compiled',
  'build:backend:compiled': 'npm run build:backend-native && node scripts/build-backend.mjs',
  'build:backend-native': 'node scripts/native-components.mjs',
  preinstall: undefined,
  install: undefined,
  prepublish: undefined,
  preprepare: undefined,
  prepare: undefined,
  postprepare: undefined,
  prebuild: undefined,
  postbuild: undefined,
  'prebuild:backend:compiled': undefined,
  'postbuild:backend:compiled': undefined,
  'prebuild:backend-native': undefined,
  'postbuild:backend-native': undefined
}
export const assertUpstreamBuildContract = (scripts) => {
  for (const [key, value] of Object.entries(contract))
    if (scripts[key] !== value)
      throw new Error(`Upstream ${key} composition changed; review the Mobius lifecycle adapter.`)
}

export const dependencyRebuildSpecs = async (root, lock) => {
  const specs = new Set()
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || !entry.hasInstallScript) continue
    const directory = join(root, path)
    try {
      await lstat(join(directory, 'package.json'))
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue
      throw error
    }
    const physical = await realpath(directory)
    if (physical === (await realpath(root)))
      throw new Error('Dependency lifecycle selected the source root.')
    specs.add(physical)
  }
  return [...specs]
}

export const installBuildDependencies = async (root, run) => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assertUpstreamBuildContract(pkg.scripts)
  await run('npm-ci', 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'])
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
  const dependencies = await dependencyRebuildSpecs(root, lock)
  if (dependencies.length)
    await run('dependency-lifecycles', 'npm', [
      'rebuild',
      '--ignore-scripts=false',
      ...dependencies
    ])
  await run('prepare-patches', process.execPath, ['scripts/prepare-shadcn-patch.mjs'])
  await run('patches', process.execPath, ['node_modules/patch-package/index.js', '--error-on-fail'])
  await run('verify-patches', process.execPath, ['scripts/check-claude-acp-patch.mjs'])
  await run('prisma', process.execPath, ['node_modules/prisma/build/index.js', 'generate'])
  const electron = JSON.parse(
    await readFile(join(root, 'node_modules/electron/package.json'), 'utf8')
  )
  const installer = electron.bin?.['install-electron']
  if (typeof installer !== 'string' || installer !== 'install.js')
    throw new Error(
      'Upstream install-electron composition changed; review the Mobius lifecycle adapter.'
    )
  await run('electron', process.execPath, [join(root, 'node_modules/electron', installer)])
  // The producer's reviewed Node pin can differ from the delivered backend runtime.
  const producerOutput = join(
    'node_modules/.cache/mobius-native-node',
    `${process.platform}-${process.arch}`
  )
  await run('native-node', process.execPath, [
    'scripts/stage-node-runtime.mjs',
    '--manifest',
    'mobius/config/native-producer-node-runtime.json',
    '--output',
    producerOutput
  ])
  const node = join(root, producerOutput, 'node')
  await run('local-native', node, ['mobius/scripts/local-native-components.mjs', 'build'])
  await run('electron-dependencies', process.execPath, [
    'mobius/scripts/rebuild-electron-dependencies.mjs'
  ])
  await run('electron-path', process.execPath, ['scripts/fix-electron-path.cjs'])
  await run('packages', 'npm', ['run', 'build:packages'])
}

export const buildApplication = async (root, run) => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assertUpstreamBuildContract(pkg.scripts)
  await run('build-packages', 'npm', ['run', 'build:packages', '--', '--clean'])
  await run('typecheck', 'npm', ['run', 'typecheck:compiled'])
  await run('verify-local-native', process.execPath, [
    'mobius/scripts/local-native-components.mjs',
    'verify'
  ])
  await run('build-backend', process.execPath, ['scripts/build-backend.mjs'])
  await run('build-electron', process.execPath, [
    'node_modules/electron-vite/bin/electron-vite.js',
    'build'
  ])
  await run('build-web', 'npm', ['run', 'build:web:compiled'])
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  throw new Error('Use the Mobius release entry to run the reviewed build composition.')
