#!/usr/bin/env node

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')

export const openCodeTarget = (platform = process.platform, arch = process.arch) => {
  const os = platform === 'win32' ? 'windows' : platform
  if (!['darwin', 'linux', 'windows'].includes(os) || !['arm64', 'x64'].includes(arch)) {
    throw new Error(`Unsupported OpenCode bundle target: ${platform}-${arch}`)
  }
  return {
    packageName: `opencode-${os}-${arch}`,
    binName: platform === 'win32' ? 'opencode.exe' : 'opencode',
    outputDir: join(REPO_ROOT, 'mobius', 'runtime', 'opencode', platform, arch)
  }
}

export const stageManagedOpenCode = ({
  platform = process.platform,
  arch = process.arch,
  version,
  npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
}) => {
  if (!version) throw new Error('A pinned OpenCode version is required.')
  const target = openCodeTarget(platform, arch)
  const scratch = mkdtempSync(join(tmpdir(), 'mobius-opencode-'))

  try {
    const packed = JSON.parse(
      execFileSync(
        npmExecutable,
        ['pack', `${target.packageName}@${version}`, '--json', '--pack-destination', scratch],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
      )
    )
    const filename = packed?.[0]?.filename
    if (typeof filename !== 'string')
      throw new Error('npm pack did not report an archive filename.')

    rmSync(target.outputDir, { recursive: true, force: true })
    mkdirSync(target.outputDir, { recursive: true })
    execFileSync(
      'tar',
      [
        '-xzf',
        join(scratch, filename),
        '-C',
        target.outputDir,
        '--strip-components=2',
        `package/bin/${target.binName}`
      ],
      { stdio: 'inherit' }
    )

    const binaryPath = join(target.outputDir, target.binName)
    if (platform !== 'win32') chmodSync(binaryPath, 0o755)
    const sha256 = createHash('sha256').update(readFileSync(binaryPath)).digest('hex')
    writeFileSync(
      join(target.outputDir, 'manifest.json'),
      `${JSON.stringify(
        { schemaVersion: 1, package: target.packageName, version, binary: target.binName, sha256 },
        null,
        2
      )}\n`
    )
    execFileSync(binaryPath, ['--version'], { stdio: 'inherit', timeout: 15_000 })
    return { ...target, binaryPath, version, sha256 }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

const main = () => {
  const product = JSON.parse(
    readFileSync(join(REPO_ROOT, 'mobius', 'config', 'product.json'), 'utf8')
  )
  const staged = stageManagedOpenCode({ version: product.managedOpencodeVersion })
  console.log(`[mobius] staged ${staged.packageName}@${staged.version} in ${staged.outputDir}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
