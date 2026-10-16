import { execFileSync } from 'node:child_process'
import { readFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
