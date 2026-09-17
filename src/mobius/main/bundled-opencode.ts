import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
  const candidates = [
    override,
    options.resourcesPath
      ? join(options.resourcesPath, 'managed-runtimes', 'opencode')
      : process.resourcesPath
        ? join(process.resourcesPath, 'managed-runtimes', 'opencode')
        : undefined,
    join(options.workspaceRoot ?? process.cwd(), 'mobius', 'runtime', 'opencode', platform, arch)
  ].filter((candidate): candidate is string => Boolean(candidate))

  return candidates.find((candidate) => existsSync(candidate))
}
