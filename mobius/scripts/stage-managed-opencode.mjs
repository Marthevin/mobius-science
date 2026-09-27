#!/usr/bin/env node

/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildManagedOpenCode } from './managed-opencode-source.mjs'

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
  version
}) => {
  const target = openCodeTarget(platform, arch)
  return { ...target, ...buildManagedOpenCode({ ...target, platform, arch, version }) }
}

const main = () => {
  const product = JSON.parse(
    readFileSync(join(REPO_ROOT, 'mobius', 'config', 'product.json'), 'utf8')
  )
  const staged = stageManagedOpenCode({ version: product.managedOpencodeVersion })
  console.log(`[mobius] staged ${staged.packageName}@${staged.version} in ${staged.outputDir}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
