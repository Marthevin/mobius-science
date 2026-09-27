/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'opencode')
export const sourcePin = JSON.parse(readFileSync(join(assets, 'source-pin.json'), 'utf8'))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const assertHash = (file, expected) => {
  if (sha(readFileSync(file)) !== expected)
    throw new Error(`OpenCode source checksum mismatch: ${file}`)
}

export const assertSourceReceipt = (receipt) => {
  if (receipt?.kind !== 'source-patched' || receipt.regression !== 'passed')
    throw new Error('Managed OpenCode requires tested source-patch provenance')
  for (const field of [
    'patchId',
    'sourceArchiveSha256',
    'patchedWebfetchSha256',
    'modelsSha256',
    'bunVersion'
  ]) {
    if (receipt[field] !== sourcePin[field])
      throw new Error(`OpenCode source pin mismatch: ${field}`)
  }
  for (const [field, resource] of [
    ['patchSha256', 'patches/webfetch-whole-response.patch'],
    ['regressionTestSha256', 'tests/webfetch-deadline.test.ts.txt']
  ]) {
    if (receipt[field] !== sha(readFileSync(join(assets, resource))))
      throw new Error(`OpenCode source receipt mismatch: ${field}`)
  }
}

// Build in a disposable source tree. Never patch an opaque release executable or
// enable external plugins. No publish/upload script is permitted in this build.
export const buildManagedOpenCode = ({
  version,
  outputDir,
  packageName,
  binName,
  platform,
  arch
}) => {
  if (version !== sourcePin.version)
    throw new Error('Review the OpenCode source pin before upgrading')
  if (platform !== process.platform || arch !== process.arch || platform === 'win32')
    throw new Error('Patched managed OpenCode currently requires a native macOS/Linux build')
  const scratch = mkdtempSync(join(tmpdir(), 'mobius-opencode-source-'))
  const env = { ...process.env, HUSKY: '0', OPENCODE_VERSION: version, OPENCODE_CHANNEL: 'latest' }
  delete env.OPENCODE_RELEASE
  const run = (binary, args, cwd = scratch) =>
    execFileSync(binary, args, {
      cwd,
      env,
      stdio: 'inherit',
      timeout: 20 * 60_000,
      maxBuffer: 32 * 1024 * 1024
    })
  try {
    const archive = join(scratch, 'source.tar.gz')
    run('curl', [
      '-fL',
      '--connect-timeout',
      '20',
      '--max-time',
      '180',
      '--max-filesize',
      '150000000',
      sourcePin.sourceUrl,
      '-o',
      archive
    ])
    assertHash(archive, sourcePin.sourceArchiveSha256)
    const source = join(scratch, 'source')
    mkdirSync(source)
    run('tar', ['-xzf', archive, '-C', source, '--strip-components=1'])
    const toolPath = join(source, 'packages/opencode/src/tool/webfetch.ts')
    assertHash(toolPath, sourcePin.upstreamWebfetchSha256)
    const patch = join(assets, 'patches/webfetch-whole-response.patch')
    run('git', ['apply', '--check', patch], source)
    run('git', ['apply', patch], source)
    assertHash(toolPath, sourcePin.patchedWebfetchSha256)
    const test = join(assets, 'tests/webfetch-deadline.test.ts.txt')
    copyFileSync(test, join(source, 'packages/opencode/test/tool/mobius-webfetch-deadline.test.ts'))
    const models = join(scratch, 'models-api.json')
    writeFileSync(models, gunzipSync(readFileSync(join(assets, 'models-api.json.gz'))))
    assertHash(models, sourcePin.modelsSha256)
    env.MODELS_DEV_API_JSON = models
    const tools = join(scratch, 'build-tools')
    run('npm', [
      'install',
      '--prefix',
      tools,
      '--no-audit',
      '--no-fund',
      `bun@${sourcePin.bunVersion}`
    ])
    const bun = join(tools, 'node_modules/.bin/bun')
    const actualBun = execFileSync(bun, ['--version'], { encoding: 'utf8', timeout: 15_000 }).trim()
    if (actualBun !== sourcePin.bunVersion) throw new Error('Pinned Bun version mismatch')
    run(
      bun,
      [
        'install',
        '--frozen-lockfile',
        '--filter',
        './packages/opencode',
        '--filter',
        './packages/script'
      ],
      source
    )
    const workspace = join(source, 'packages/opencode')
    run(
      bun,
      ['test', 'test/tool/mobius-webfetch-deadline.test.ts', 'test/tool/webfetch.test.ts'],
      workspace
    )
    run(
      bun,
      ['run', 'script/build.ts', '--single', '--skip-install', '--skip-embed-web-ui'],
      workspace
    )
    const built = join(workspace, 'dist', packageName, 'bin', binName)
    const actualVersion = execFileSync(built, ['--version'], {
      encoding: 'utf8',
      timeout: 30_000
    }).trim()
    if (actualVersion !== version)
      throw new Error(`Built OpenCode version mismatch: ${actualVersion}`)
    const receipt = {
      kind: 'source-patched',
      patchId: sourcePin.patchId,
      sourceArchiveSha256: sourcePin.sourceArchiveSha256,
      patchedWebfetchSha256: sourcePin.patchedWebfetchSha256,
      modelsSha256: sourcePin.modelsSha256,
      bunVersion: actualBun,
      patchSha256: sha(readFileSync(patch)),
      regressionTestSha256: sha(readFileSync(test)),
      regression: 'passed',
      embeddedWebUi: false
    }
    assertSourceReceipt(receipt)
    rmSync(outputDir, { recursive: true, force: true })
    mkdirSync(outputDir, { recursive: true })
    const binaryPath = join(outputDir, binName)
    copyFileSync(built, binaryPath)
    copyFileSync(join(source, 'LICENSE'), join(outputDir, 'LICENSE.opencode.txt'))
    const sha256 = sha(readFileSync(binaryPath))
    writeFileSync(
      join(outputDir, 'manifest.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          package: packageName,
          version,
          binary: binName,
          sha256,
          sourceBuild: receipt
        },
        null,
        2
      ) + '\n'
    )
    return { binaryPath, version, sha256 }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
