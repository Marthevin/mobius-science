import { execFileSync } from 'node:child_process'
import {
  copyFile,
  readFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { c as createTar } from 'tar'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

it('fails closed when the upstream build or postinstall composition changes', async () => {
  const composition = await import('./build-composition.mjs')
  expect(composition.assertUpstreamBuildContract).toBeTypeOf('function')
  const pkg = JSON.parse(await readFile('package.json', 'utf8'))
  expect(() => composition.assertUpstreamBuildContract(pkg.scripts)).not.toThrow()
  for (const key of [
    'build',
    'postinstall',
    'build:backend:compiled',
    'build:backend-native',
    'prepare'
  ]) {
    expect(() =>
      composition.assertUpstreamBuildContract({ ...pkg.scripts, [key]: 'changed upstream command' })
    ).toThrow(/composition/)
  }
})

it('restores every installed dependency lifecycle without rerunning the upstream root native installer', async () => {
  const composition = await import('./build-composition.mjs')
  expect(composition.dependencyRebuildSpecs).toBeTypeOf('function')
  const root = await mkdtemp(join(tmpdir(), 'mobius-install-composition-'))
  roots.push(root)
  for (const [path, name, version] of [
    ['node_modules/esbuild', 'esbuild', '0.25.12'],
    ['node_modules/vite/node_modules/esbuild', 'esbuild', '0.28.1']
  ]) {
    await mkdir(join(root, path), { recursive: true })
    await writeFile(join(root, path, 'package.json'), JSON.stringify({ name, version }))
  }
  const lock = {
    packages: {
      '': { name: 'open-science', hasInstallScript: true },
      'node_modules/esbuild': { version: '0.25.12', hasInstallScript: true },
      'node_modules/vite/node_modules/esbuild': { version: '0.28.1', hasInstallScript: true },
      'node_modules/absent-platform-optional': {
        version: '1.0.0',
        hasInstallScript: true,
        optional: true
      }
    }
  }
  await expect(composition.dependencyRebuildSpecs(root, lock)).resolves.toEqual([
    await realpath(join(root, 'node_modules/esbuild')),
    await realpath(join(root, 'node_modules/vite/node_modules/esbuild'))
  ])
})

it.skipIf(process.platform === 'win32')(
  'runs the native producer with its own pinned Node while preserving the product runtime',
  async () => {
    const { installBuildDependencies } = await import('./build-composition.mjs')
    const root = await mkdtemp(join(tmpdir(), 'mobius-producer-composition-'))
    roots.push(root)
    await mkdir(join(root, 'scripts'), { recursive: true })
    await mkdir(join(root, 'build'), { recursive: true })
    await mkdir(join(root, 'mobius/config'), { recursive: true })
    await mkdir(join(root, 'node_modules/electron'), { recursive: true })
    await copyFile('package.json', join(root, 'package.json'))
    await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: {} }))
    await writeFile(
      join(root, 'node_modules/electron/package.json'),
      JSON.stringify({ bin: { 'install-electron': 'install.js' } })
    )
    await copyFile('scripts/stage-node-runtime.mjs', join(root, 'scripts/stage-node-runtime.mjs'))
    for (const dependency of ['tar', 'fflate', 'undici'])
      await symlink(
        join(process.cwd(), 'node_modules', dependency),
        join(root, 'node_modules', dependency)
      )
    const target = `${process.platform}-${process.arch}`
    const cache = join(root, 'node_modules/.cache/node-runtime')
    await mkdir(cache, { recursive: true })
    for (const [version, path] of [
      ['22.23.4', 'build/node-runtime.json'],
      ['22.23.3', 'mobius/config/native-producer-node-runtime.json']
    ]) {
      const name = `node-v${version}-${target}`
      const file = `${name}.tar.gz`
      await mkdir(join(root, name, 'bin'), { recursive: true })
      await writeFile(join(root, name, 'bin/node'), `#!/bin/sh\nprintf 'v${version}\\n'\n`)
      await writeFile(join(root, name, 'LICENSE'), 'fixture license')
      const archive = join(cache, file)
      await createTar({ cwd: root, file: archive, gzip: true }, [name])
      await writeFile(
        join(root, path),
        JSON.stringify({
          version,
          source: `https://nodejs.org/dist/v${version}/SHASUMS256.txt`,
          archives: {
            [target]: {
              file,
              sha256: createHash('sha256')
                .update(await readFile(archive))
                .digest('hex')
            }
          }
        })
      )
    }
    const productRuntime = join(root, 'out/node-runtime', target)
    await mkdir(productRuntime, { recursive: true })
    await writeFile(join(productRuntime, 'node'), 'preserved product runtime')
    let producerVersion: string | undefined
    await installBuildDependencies(
      root,
      async (name: string, executable: string, args: string[]) => {
        if (name === 'native-node') execFileSync(executable, args, { cwd: root, stdio: 'pipe' })
        if (name === 'local-native')
          producerVersion = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim()
      }
    )
    expect(producerVersion).toBe('v22.23.3')
    expect(await readFile(join(productRuntime, 'node'), 'utf8')).toBe('preserved product runtime')
  }
)

it('runs nested dependency lifecycles with canonical paths and excludes root lifecycle hooks', async () => {
  const { dependencyRebuildSpecs } = await import('./build-composition.mjs')
  const root = await mkdtemp(join(tmpdir(), 'mobius-real-rebuild-'))
  roots.push(root)
  const inner = 'node_modules/outer/node_modules/inner'
  await mkdir(join(root, inner), { recursive: true })
  const lifecycle = (name: string): string =>
    `node -e "require('node:fs').appendFileSync(process.env.MOBIUS_LIFECYCLE_LOG, '${name}\\n')"`
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      version: '1.0.0',
      dependencies: { outer: '1.0.0' },
      scripts: { postinstall: lifecycle('root') }
    })
  )
  await writeFile(
    join(root, 'node_modules/outer/package.json'),
    JSON.stringify({
      name: 'outer',
      version: '1.0.0',
      dependencies: { inner: '2.0.0' },
      scripts: { postinstall: lifecycle('outer') }
    })
  )
  await writeFile(
    join(root, inner, 'package.json'),
    JSON.stringify({
      name: 'inner',
      version: '2.0.0',
      scripts: {
        preinstall: lifecycle('preinstall'),
        install: lifecycle('install'),
        postinstall: lifecycle('postinstall')
      }
    })
  )
  const specs = await dependencyRebuildSpecs(root, {
    packages: {
      '': { hasInstallScript: true },
      [inner]: { hasInstallScript: true }
    }
  })
  const log = join(root, 'lifecycle.log')
  execFileSync('npm', ['rebuild', '--ignore-scripts=false', ...specs], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, npm_config_ignore_scripts: 'true', MOBIUS_LIFECYCLE_LOG: log }
  })
  expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual([
    'preinstall',
    'install',
    'postinstall'
  ])
})
