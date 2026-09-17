#!/usr/bin/env node

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')

export const runtimeTarget = (platform = process.platform, arch = process.arch) => {
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) {
    return { subdir: arch === 'arm64' ? 'osx-arm64' : 'osx-64', os: 'mac', arch, bin: 'micromamba' }
  }
  if (platform === 'linux' && ['arm64', 'x64'].includes(arch)) {
    return {
      subdir: arch === 'arm64' ? 'linux-aarch64' : 'linux-64',
      os: 'linux',
      arch,
      bin: 'micromamba'
    }
  }
  if (platform === 'win32' && arch === 'x64') {
    return { subdir: 'win-64', os: 'win', arch, bin: 'micromamba.exe' }
  }
  throw new Error(`Unsupported managed runtime target: ${platform}-${arch}`)
}

const runNode = (script, args = [], env = process.env) =>
  execFileSync(process.execPath, [script, ...args], {
    cwd: REPO_ROOT,
    env,
    stdio: 'inherit',
    maxBuffer: 256 * 1024 * 1024
  })

const main = () => {
  const target = runtimeTarget()
  const micromambaDir = join(REPO_ROOT, 'resources', 'bin', target.os, target.arch)
  const micromambaPath = join(micromambaDir, target.bin)
  mkdirSync(micromambaDir, { recursive: true })
  if (!existsSync(micromambaPath)) {
    runNode(join(REPO_ROOT, 'scripts', 'fetch-micromamba.mjs'), [target.subdir, micromambaPath])
  }
  if (process.platform === 'win32') {
    const compat = join(micromambaDir, 'micromamba-compat.exe')
    if (!existsSync(compat)) {
      runNode(join(REPO_ROOT, 'scripts', 'fetch-micromamba.mjs'), [
        target.subdir,
        compat,
        'compatibility'
      ])
    }
  }

  runNode(join(SCRIPT_DIR, 'stage-managed-opencode.mjs'))
  const bundleDir = join(REPO_ROOT, 'mobius', 'runtime', 'default-envs')
  runNode(join(REPO_ROOT, 'scripts', 'stage-default-envs.mjs'), [], {
    ...process.env,
    MICROMAMBA_BIN: micromambaPath,
    OS_STAGE_PLATFORM: target.subdir,
    RUNTIME_STAGE_OUT: bundleDir,
    RUNTIME_STAGE_PACKS: 'python-3.12,r-4.4'
  })

  const manifest = JSON.parse(readFileSync(join(bundleDir, 'manifest.json'), 'utf8'))
  const packs = Object.keys(manifest.packs ?? {}).sort()
  if (packs.join(',') !== 'python-3.12,r-4.4') {
    throw new Error(`Unexpected Mobius runtime pack set: ${packs.join(',')}`)
  }
  console.log(`[mobius] staged managed runtimes for ${target.subdir}: ${packs.join(', ')}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
