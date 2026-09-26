import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const fixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'mobius-release-test-'))
  roots.push(root)
  return root
}

it('can start from a fresh checkout before node_modules exists', async () => {
  const { mkdir, copyFile } = await import('node:fs/promises')
  const root = await fixture()
  const scripts = join(root, 'mobius/scripts')
  await mkdir(scripts, { recursive: true })
  for (const name of ['build-release.mjs', 'release-audit.mjs']) {
    await copyFile(join(process.cwd(), 'mobius/scripts', name), join(scripts, name))
  }
  const output = execFileSync(process.execPath, [join(scripts, 'build-release.mjs'), '--help'], {
    encoding: 'utf8',
    cwd: root
  })
  expect(output).toContain('Usage: npm run release:mobius:mac')
})

it('exports committed source without ignored build residue and refuses uncommitted source', async () => {
  const { sourceIdentity, exportSource } = await import('./build-release.mjs')
  const root = await fixture()
  const git = (...args: string[]): Buffer => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  git('init', '-q')
  await writeFile(join(root, '.gitignore'), 'dist/\n')
  await writeFile(join(root, 'tracked.txt'), 'committed')
  git('add', '.')
  git(
    '-c',
    'user.name=Release Test',
    '-c',
    'user.email=release@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    'fixture'
  )
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(root, 'dist'))
  await writeFile(join(root, 'dist/old.dmg'), 'old package')
  const identity = sourceIdentity(root)
  const destination = join(await fixture(), 'snapshot')
  exportSource(root, identity.commit, destination)
  expect(await readFile(join(destination, 'tracked.txt'), 'utf8')).toBe('committed')
  await expect(access(join(destination, 'dist'))).rejects.toThrow()
  await writeFile(join(root, 'tracked.txt'), 'modified')
  expect(() => sourceIdentity(root)).toThrow(/uncommitted/)
})

it('does not publish a ready manifest or run later phases when a gate fails', async () => {
  const { runReleaseSteps } = await import('./build-release.mjs')
  const root = await fixture()
  const marker = join(root, 'later-phase')
  await expect(
    runReleaseSteps(root, { commit: 'test' }, [
      {
        name: 'audit',
        run: async () => {
          throw new Error('nested release detected')
        }
      },
      {
        name: 'publish',
        run: async () => {
          await writeFile(marker, 'wrong')
        }
      }
    ])
  ).rejects.toThrow(/nested release/)
  expect(JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'))).toMatchObject({
    status: 'failed',
    failedStep: 'audit'
  })
  await expect(access(marker)).rejects.toThrow()
})

it('marks a build ready only after every gate completes and records the results', async () => {
  const { runReleaseSteps, releaseEnvironment } = await import('./build-release.mjs')
  const root = await fixture()
  await runReleaseSteps(root, { commit: 'test' }, [
    { name: 'smoke', run: async () => ({ passed: true }) }
  ])
  expect(JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'))).toMatchObject({
    status: 'ready',
    steps: [{ name: 'smoke', result: { passed: true } }]
  })
  const env = releaseEnvironment({
    PATH: '/bin',
    ELECTRON_RUN_AS_NODE: '1',
    OPEN_SCIENCE_E2E_FAKE_AGENT: 'leaked'
  })
  expect(env).toEqual({ PATH: '/bin' })
})

const systemProxy = `<dictionary> {
  HTTPEnable : 1
  HTTPPort : 1082
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 1082
  HTTPSProxy : 127.0.0.1
}`

it('uses the actual macOS proxy for Node downloads and child installers with TLS intact', async () => {
  const { buildEnvironment } = await import('./build-release.mjs')
  expect(buildEnvironment({ PATH: '/bin' }, systemProxy, true)).toEqual({
    PATH: '/bin',
    HTTP_PROXY: 'http://127.0.0.1:1082',
    HTTPS_PROXY: 'http://127.0.0.1:1082',
    NODE_USE_ENV_PROXY: '1',
    NO_PROXY: 'localhost,127.0.0.1,::1'
  })
})

it('gives explicit proxy settings precedence and preserves bypass policy', async () => {
  const { buildEnvironment } = await import('./build-release.mjs')
  const env = buildEnvironment(
    { https_proxy: 'http://proxy.example:8080', no_proxy: 'localhost,.example' },
    systemProxy,
    true
  )
  expect(env.https_proxy).toBe('http://proxy.example:8080')
  expect(env.HTTP_PROXY).toBeUndefined()
  expect(env.no_proxy).toBe('localhost,.example')
  expect(env.NO_PROXY).toBeUndefined()
  expect(env.NODE_USE_ENV_PROXY).toBe('1')
})

it('fails clearly for unsupported proxy configurations without disabling TLS', async () => {
  const { buildEnvironment } = await import('./build-release.mjs')
  expect(() => buildEnvironment({}, systemProxy, false)).toThrow(/Node.*use-env-proxy/)
  expect(() => buildEnvironment({}, 'ProxyAutoConfigEnable : 1', true)).toThrow(/PAC/)
  expect(() => buildEnvironment({ ALL_PROXY: 'socks5://127.0.0.1:1080' }, '', true)).toThrow(
    /HTTP.*proxy/
  )
  expect(buildEnvironment({}, '<dictionary> {}', false)).toEqual({})
})
