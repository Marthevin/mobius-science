import { isAbsolute } from 'node:path'

export const allowMobiusMultiInstance = (input: {
  isPackaged: boolean
  allowMultiInstance: string | undefined
  e2eStorageRoot: string | undefined
  userDataOverride: string | undefined
}): boolean => {
  if (input.allowMultiInstance !== '1') return false
  if (!input.isPackaged) return true

  const e2eStorageRoot = input.e2eStorageRoot?.trim()
  const userDataOverride = input.userDataOverride?.trim()
  return Boolean(
    e2eStorageRoot && isAbsolute(e2eStorageRoot) && userDataOverride && isAbsolute(userDataOverride)
  )
}
