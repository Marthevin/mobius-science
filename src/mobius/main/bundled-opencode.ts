import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { runtimeMetadataIfConfigured } from '../../main/runtime-metadata'

type BundledOpenCodeOptions = Readonly<{
  resourcesPath?: string
  workspaceRoot?: string
  platform?: NodeJS.Platform
  arch?: string
  override?: string
}>

export const resolveBundledOpenCodeDir = (
  options: BundledOpenCodeOptions = {}
): string | undefined => {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const override = options.override ?? process.env.MOBIUS_OPENCODE_DIR
  const resourcesPath =
    options.resourcesPath ?? runtimeMetadataIfConfigured()?.resourcesPath ?? process.resourcesPath
  const candidates = [
    override,
    resourcesPath ? join(resourcesPath, 'managed-runtimes', 'opencode') : undefined,
    // The ordinary Node backend lives at Resources/backend/resources; Mobius keeps its
    // checksum-pinned executable beside that backend so the generic signer cannot rewrite it.
    resourcesPath ? join(resourcesPath, '..', '..', 'managed-runtimes', 'opencode') : undefined,
    runtimeMetadataIfConfigured()?.packaged
      ? undefined
      : join(
          options.workspaceRoot ?? process.cwd(),
          'mobius',
          'runtime',
          'opencode',
          platform,
          arch
        )
  ].filter((candidate): candidate is string => Boolean(candidate))

  return candidates.find((candidate) => existsSync(candidate))
}
