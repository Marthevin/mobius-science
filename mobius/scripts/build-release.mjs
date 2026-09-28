#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { auditMacApp, sha256File, verifyOpenCode, verifyRuntimePacks } from './release-audit.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

// Electron reports canonical executable paths (macOS /var aliases /private/var).
export const createBuildWorkspace = (parent = tmpdir()) =>
  realpathSync(mkdtempSync(join(parent, 'mobius-release-build-')))

export const sourceIdentity = (root) => {
  if (git(root, 'status', '--porcelain', '--untracked-files=normal')) {
    throw new Error(
      'Source has uncommitted changes. Commit the intended source before building; no files were stashed or deleted.'
    )
  }
  if (
    git(root, 'ls-files', '--stage')
      .split('\n')
      .some((line) => line.startsWith('160000 '))
  ) {
    throw new Error('Git submodules need an explicit export policy before release.')
  }
  return {
    commit: git(root, 'rev-parse', 'HEAD'),
    branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD')
  }
}

export const exportSource = (root, commit, destination) => {
  mkdirSync(destination, { recursive: true })
  const archive = join(destination, '.release-source.tar')
  try {
    execFileSync('git', ['archive', '--format=tar', '--output', archive, commit], { cwd: root })
    execFileSync('tar', ['-xf', archive, '-C', destination])
  } finally {
    rmSync(archive, { force: true })
  }
}

export const releaseEnvironment = (input = process.env) =>
  Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => key !== 'ELECTRON_RUN_AS_NODE' && !key.startsWith('OPEN_SCIENCE_E2E_')
    )
  )

const hasProxy = (env) =>
  ['http_proxy', 'HTTP_PROXY', 'https_proxy', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY'].some(
    (key) => env[key]
  )

export const buildEnvironment = (
  input,
  systemProxyText,
  supportsEnvProxy = process.allowedNodeEnvironmentFlags.has('--use-env-proxy')
) => {
  const env = releaseEnvironment(input)
  const settings = Object.fromEntries(
    [...systemProxyText.matchAll(/^\s*(\w+)\s+:\s+([^\n]+)$/gm)].map((m) => [m[1], m[2].trim()])
  )
  if (!hasProxy(env)) {
    for (const protocol of ['HTTP', 'HTTPS']) {
      if (settings[`${protocol}Enable`] !== '1') continue
      const host = settings[`${protocol}Proxy`]
      const port = Number(settings[`${protocol}Port`])
      if (
        !host ||
        !/^[\w.:[\]-]+$/.test(host) ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      )
        throw new Error('Invalid macOS proxy setting; configure an explicit HTTP(S)_PROXY.')
      env[`${protocol}_PROXY`] =
        `http://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}:${port}`
    }
    if (!hasProxy(env) && (settings.ProxyAutoConfigEnable === '1' || settings.SOCKSEnable === '1'))
      throw new Error(
        'PAC/SOCKS-only proxy cannot be used by this build. Set an explicit HTTP(S)_PROXY.'
      )
  }
  const allProxy = env.all_proxy || env.ALL_PROXY
  if (allProxy) {
    if (!/^https?:\/\//i.test(allProxy))
      throw new Error('Build downloads require an HTTP(S) proxy; SOCKS ALL_PROXY is unsupported.')
    if (!env.http_proxy && !env.HTTP_PROXY) env.HTTP_PROXY = allProxy
    if (!env.https_proxy && !env.HTTPS_PROXY) env.HTTPS_PROXY = allProxy
  }
  if (hasProxy(env)) {
    if (!supportsEnvProxy)
      throw new Error(
        'This Node version lacks --use-env-proxy. Use a current Node release supporting it.'
      )
    env.NODE_USE_ENV_PROXY = '1'
    if (!env.NO_PROXY && !env.no_proxy) env.NO_PROXY = 'localhost,127.0.0.1,::1'
  }
  return env
}

export const runReleaseSteps = async (output, identity, steps) => {
  const manifest = {
    schemaVersion: 1,
    ...identity,
    status: 'running',
    startedAt: new Date().toISOString(),
    steps: []
  }
  const save = () =>
    writeFile(join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  await save()
  for (const step of steps) {
    console.log(`[mobius-release] ${step.name}`)
    const started = Date.now()
    try {
      const result = await step.run()
      manifest.steps.push({
        name: step.name,
        durationMs: Date.now() - started,
        result: result ?? null
      })
      await save()
    } catch (error) {
      manifest.status = 'failed'
      manifest.failedStep = step.name
      manifest.error = error instanceof Error ? error.message : String(error)
      manifest.finishedAt = new Date().toISOString()
      await save()
      throw error
    }
  }
  manifest.status = 'ready'
  manifest.finishedAt = new Date().toISOString()
  await save()
  return manifest
}

const command = async (cwd, logPath, executable, args, env) => {
  const { createWriteStream } = await import('node:fs')
  const log = createWriteStream(logPath, { flags: 'a' })
  log.write(`\n$ ${JSON.stringify([executable, ...args])}\n`)
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30 * 60 * 1000
    })
    child.stdout.pipe(log, { end: false })
    child.stderr.pipe(log, { end: false })
    const heartbeat = setInterval(
      () => console.log(`[mobius-release] still running; log: ${logPath}`),
      30_000
    )
    child.once('error', (error) => {
      clearInterval(heartbeat)
      log.end()
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearInterval(heartbeat)
      log.end(() =>
        code === 0
          ? resolvePromise()
          : reject(new Error(`Command failed (${code ?? signal}); see ${logPath}`))
      )
    })
  })
}

const runtimeFiles = (arch) => [
  'mobius/runtime/default-envs/manifest.json',
  'mobius/runtime/default-envs/python-3.12.tar.zst',
  'mobius/runtime/default-envs/r-4.4.tar.zst',
  `mobius/runtime/opencode/darwin/${arch}/manifest.json`,
  `mobius/runtime/opencode/darwin/${arch}/opencode`,
  `mobius/runtime/opencode/darwin/${arch}/LICENSE.opencode.txt`,
  `resources/bin/mac/${arch}/micromamba`
]
const copyRuntimeFiles = async (from, to, arch) => {
  for (const name of runtimeFiles(arch)) {
    await mkdir(dirname(join(to, name)), { recursive: true })
    await copyFile(join(from, name), join(to, name))
  }
}

const stageRuntimes = async ({ source, arch, product, run, cacheRoot }) => {
  const recipe = createHash('sha256').update(`darwin-${arch}`)
  for (const path of [
    'mobius/config/product.json',
    'mobius/scripts/stage-managed-runtimes.mjs',
    'mobius/scripts/stage-managed-opencode.mjs',
    'mobius/scripts/managed-opencode-source.mjs',
    'mobius/opencode/source-pin.json',
    'mobius/opencode/patches/webfetch-whole-response.patch',
    'mobius/opencode/tests/webfetch-deadline.test.ts.txt',
    'mobius/opencode/models-api.json.gz',
    'scripts/stage-default-envs.mjs',
    'scripts/pack-archive.mjs',
    'scripts/fetch-micromamba.mjs',
    'scripts/micromamba-versions.json',
    'src/main/notebook/runtime-paths.ts'
  ])
    recipe.update(readFileSync(join(source, path)))
  const key = recipe.digest('hex')
  const cache = join(cacheRoot, key)
  let reused = false
  if (existsSync(join(cache, 'receipt.json'))) {
    const receipt = await readJson(join(cache, 'receipt.json'))
    if (receipt.recipe !== key) throw new Error('Runtime cache recipe mismatch')
    for (const file of runtimeFiles(arch)) {
      if ((await sha256File(join(cache, file))) !== receipt.sha256[file])
        throw new Error(
          `Runtime cache checksum mismatch: ${file}. Remove this build cache and retry.`
        )
    }
    await copyRuntimeFiles(cache, source, arch)
    reused = true
  } else {
    await run('stage-runtimes', process.execPath, ['mobius/scripts/stage-managed-runtimes.mjs'])
  }
  const subdir = arch === 'arm64' ? 'osx-arm64' : 'osx-64'
  const packs = await verifyRuntimePacks(join(source, 'mobius/runtime/default-envs'), subdir)
  const opencode = await verifyOpenCode(
    join(source, `mobius/runtime/opencode/darwin/${arch}`),
    arch,
    product.managedOpencodeVersion
  )
  if (!reused) {
    const receipt = { recipe: key, sha256: {} }
    await copyRuntimeFiles(source, cache, arch)
    for (const file of runtimeFiles(arch))
      receipt.sha256[file] = await sha256File(join(cache, file))
    // Receipt is written last. Incomplete caches can never be reused.
    await writeFile(join(cache, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  }
  return { recipe: key, reused, packs, opencode }
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      output: { type: 'string' },
      arch: { type: 'string', default: process.arch },
      help: { type: 'boolean' }
    }
  })
  if (values.help) {
    console.log(
      'Usage: npm run release:mobius:mac -- [--output NEW_DIRECTORY] [--arch arm64|x64]\nBuilds committed HEAD in an isolated snapshot. Native macOS only. All acceptance gates are mandatory.'
    )
    return
  }
  if (
    process.platform !== 'darwin' ||
    !['arm64', 'x64'].includes(values.arch) ||
    values.arch !== process.arch
  ) {
    throw new Error(
      'This release entry requires native macOS and the host architecture; cross-architecture smoke testing is not supported.'
    )
  }
  const identity = sourceIdentity(ROOT)
  const env = buildEnvironment(
    process.env,
    hasProxy(process.env) ? '' : execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8' })
  )
  const pkg = await readJson(join(ROOT, 'package.json'))
  const product = await readJson(join(ROOT, 'mobius/config/product.json'))
  const policy = await readJson(join(ROOT, 'mobius/config/release-policy.json'))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const output = resolve(
    values.output ??
      join(ROOT, 'output/releases', `${pkg.version}-${identity.commit.slice(0, 9)}-${stamp}`)
  )
  if (existsSync(output))
    throw new Error(`Output already exists; choose a new directory: ${output}`)
  await mkdir(dirname(output), { recursive: true })
  await mkdir(output)
  await mkdir(join(output, 'logs'))
  const scratch = createBuildWorkspace()
  const source = join(scratch, 'source')
  const build = join(scratch, 'package')
  const appPath = join(build, `mac${values.arch === 'arm64' ? '-arm64' : ''}`, 'Mobius Science.app')
  const installedApp = join(scratch, 'installed', 'Mobius Science.app')
  const run = (name, executable, args, overrides = {}) =>
    command(source, join(output, 'logs', `${name}.log`), executable, args, { ...env, ...overrides })
  let audit, dmg, artifact
  try {
    await runReleaseSteps(
      output,
      {
        ...identity,
        product: product.displayName,
        version: pkg.version,
        platform: process.platform,
        arch: values.arch,
        node: process.version,
        policy,
        signing: 'local macOS build; signature verification required, notarization not requested',
        testScope:
          'application copied from mounted DMG with exact ASAR/icon fingerprints; fresh/restart, legacy database filename migration with conversation/file retention and conflict rejection in isolated profiles with mock keychain; not all historical schemas, live LLM or real credential migration acceptance'
      },
      [
        {
          name: 'source-snapshot',
          run: async () => {
            exportSource(ROOT, identity.commit, source)
            return { packageLockSha256: await sha256File(join(source, 'package-lock.json')) }
          }
        },
        {
          name: 'locked-dependencies',
          run: () => run('npm-ci', 'npm', ['ci', '--no-audit', '--no-fund'])
        },
        {
          name: 'packaging-regressions',
          run: () =>
            run('tests', 'npm', [
              'test',
              '--',
              'mobius/scripts',
              'scripts/app-license-packaging.test.ts'
            ])
        },
        {
          name: 'managed-runtimes',
          run: () =>
            stageRuntimes({
              source,
              arch: values.arch,
              product,
              run,
              cacheRoot: join(homedir(), 'Library/Caches/MobiusScienceBuild/runtimes')
            })
        },
        { name: 'brand-assets', run: () => run('brand', 'npm', ['run', 'generate:brand-assets']) },
        { name: 'typecheck-and-build', run: () => run('build', 'npm', ['run', 'build']) },
        {
          name: 'package-dmg',
          run: async () => {
            await run('package', process.execPath, [
              'node_modules/electron-builder/cli.js',
              '--config',
              'mobius/electron-builder.cjs',
              '--mac',
              'dmg',
              `--${values.arch}`,
              '--publish',
              'never',
              `--config.directories.output=${build}`
            ])
            const files = (await readdir(build)).filter((name) => name.endsWith('.dmg'))
            if (files.length !== 1) throw new Error(`Expected one DMG, found ${files.length}`)
            dmg = join(build, files[0])
            if ((await stat(dmg)).size > policy.maxDmgBytes)
              throw new Error('DMG exceeds size budget')
          }
        },
        {
          name: 'bundle-audit',
          run: async () => {
            audit = await auditMacApp({
              appPath,
              arch: values.arch,
              version: pkg.version,
              product,
              policy,
              dependencyRoot: source
            })
            await writeFile(
              join(output, 'bundle-audit.json'),
              JSON.stringify(audit, null, 2) + '\n'
            )
            return {
              appBytes: audit.appBytes,
              asarBytes: audit.asarBytes,
              asarSha256: audit.asarSha256,
              appIcon: audit.appIcon,
              iconAssets: audit.iconAssets,
              brandAssets: audit.brandAssets
            }
          }
        },
        {
          name: 'signatures-and-dmg',
          run: async () => {
            await run('signature', 'codesign', [
              '--verify',
              '--deep',
              '--strict',
              '--verbose=2',
              appPath
            ])
            await run('dmg-verify', 'hdiutil', ['verify', dmg])
            const mount = join(scratch, 'mounted')
            await mkdir(mount)
            await run('dmg-mount', 'hdiutil', [
              'attach',
              dmg,
              '-readonly',
              '-nobrowse',
              '-mountpoint',
              mount
            ])
            try {
              const mountedHash = await sha256File(
                join(mount, 'Mobius Science.app/Contents/Resources/app.asar')
              )
              if (mountedHash !== audit.asarSha256)
                throw new Error('Mounted DMG does not match audited application')
              await copyFile(join(mount, '.background.png'), join(output, 'dmg-background.png'))
              await mkdir(dirname(installedApp), { recursive: true })
              await run('install-candidate', '/usr/bin/ditto', [
                join(mount, 'Mobius Science.app'),
                installedApp
              ])
            } finally {
              await run('dmg-unmount', 'hdiutil', ['detach', mount])
            }
          }
        },
        {
          name: 'installed-candidate-audit',
          run: async () => {
            const installed = await auditMacApp({
              appPath: installedApp,
              arch: values.arch,
              version: pkg.version,
              product,
              policy,
              dependencyRoot: source
            })
            if (
              installed.asarSha256 !== audit.asarSha256 ||
              JSON.stringify(installed.iconAssets) !== JSON.stringify(audit.iconAssets)
            )
              throw new Error('Installed DMG candidate differs from audited application')
            await run('installed-signature', 'codesign', [
              '--verify',
              '--deep',
              '--strict',
              '--verbose=2',
              installedApp
            ])
            return { asarSha256: installed.asarSha256, iconAssets: installed.iconAssets }
          }
        },
        {
          name: 'packaged-startup-restart',
          run: () =>
            run(
              'smoke',
              process.execPath,
              [
                'node_modules/@playwright/test/cli.js',
                'test',
                'e2e/mobius-release-smoke.spec.ts',
                `--output=${join(output, 'smoke')}`,
                '--reporter=list'
              ],
              {
                OPEN_SCIENCE_E2E_EXECUTABLE: join(installedApp, 'Contents/MacOS/Mobius Science'),
                OPEN_SCIENCE_E2E_EXPECTED_ASAR_SHA256: audit.asarSha256,
                OPEN_SCIENCE_E2E_USE_MOCK_KEYCHAIN: '1'
              }
            )
        },
        {
          name: 'deliver-artifact',
          run: async () => {
            if (sourceIdentity(ROOT).commit !== identity.commit)
              throw new Error('Source HEAD changed during the release build')
            const filename = dmg.split('/').at(-1)
            const target = join(output, filename)
            await copyFile(dmg, target)
            artifact = {
              filename,
              bytes: (await stat(target)).size,
              sha256: await sha256File(target)
            }
            await writeFile(join(output, 'SHA256SUMS'), `${artifact.sha256}  ${filename}\n`)
            return artifact
          }
        }
      ]
    )
    console.log(`[mobius-release] READY: ${join(output, artifact.filename)}`)
  } finally {
    // Only the directory created by this invocation is removed. Source checkout and profiles are untouched.
    await rm(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[mobius-release] FAILED: ${error.message}`)
    process.exitCode = 1
  })
}
