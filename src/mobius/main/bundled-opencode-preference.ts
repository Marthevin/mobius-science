import { createHash } from 'node:crypto'
import { constants, createReadStream, existsSync } from 'node:fs'
import { access, lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { PRODUCT } from '../shared/product-config'

export type BundledOpenCodeRuntime = { path: string; version: string }

// Packaged Mobius owns its managed runtime. Old profile/PATH selections must not
// silently bypass a shipped fix. Development without a bundle keeps normal discovery.
// Verify once per process owner, not on every prompt or token.
export const createBundledOpenCodeResolver = (
  options: { directory?: string; required?: boolean } = {}
): (() => Promise<BundledOpenCodeRuntime | undefined>) => {
  let pending: Promise<BundledOpenCodeRuntime | undefined> | undefined
  const resolve = async (): Promise<BundledOpenCodeRuntime | undefined> => {
    const directory =
      options.directory ??
      process.env.MOBIUS_OPENCODE_DIR ??
      (process.resourcesPath ? join(process.resourcesPath, 'managed-runtimes/opencode') : undefined)
    const required =
      options.required ??
      Boolean(options.directory || process.env.MOBIUS_OPENCODE_DIR || app?.isPackaged)
    if (!directory || !existsSync(directory)) {
      if (required)
        throw new Error('Bundled OpenCode is missing; reinstall the verified Mobius Science build')
      return undefined
    }
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    const binary = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
    if (
      manifest.schemaVersion !== 1 ||
      manifest.binary !== binary ||
      manifest.version !== PRODUCT.managedOpencodeVersion ||
      manifest.sourceBuild?.kind !== 'source-patched' ||
      manifest.sourceBuild?.regression !== 'passed'
    )
      throw new Error(
        'Bundled OpenCode identity mismatch; reinstall the verified Mobius Science build'
      )
    const path = join(directory, binary)
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('Bundled OpenCode is not a regular executable')
    await access(path, constants.X_OK)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    if (hash.digest('hex') !== manifest.sha256)
      throw new Error(
        'Bundled OpenCode checksum mismatch; reinstall the verified Mobius Science build'
      )
    return { path, version: manifest.version }
  }
  return () =>
    (pending ??= resolve().catch((error) => {
      pending = undefined
      throw error
    }))
}
