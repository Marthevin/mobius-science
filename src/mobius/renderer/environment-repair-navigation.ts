import { getEnvironmentRepairPanel as getUpstreamEnvironmentRepairPanel } from '../../renderer/src/lib/settings-navigation'
import type { EnvironmentCheckItem } from '../../shared/settings'

// Mobius keeps repair reachable through the visible Runtimes panel.
export const getEnvironmentRepairPanel = (
  failures: readonly EnvironmentCheckItem[]
): 'runtimes' | 'storage' | undefined => {
  const panel = getUpstreamEnvironmentRepairPanel(failures)
  return panel === 'agent' ? 'runtimes' : panel
}
