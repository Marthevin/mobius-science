import { join } from 'node:path'

import type { AgentConfigFile } from '../../main/agent-framework/types'
import { PRODUCT } from '../shared/product-config'

const PACKAGE_NAME = 'mobius-science-managed-opencode-config'
const PLUGIN_PACKAGE = '@opencode-ai/plugin'

// OpenCode 1.18.x starts a detached package-manager job for every writable config directory,
// including --pure sessions with no external plugins. Its current fast path only verifies that
// node_modules exists and that package-lock.json declares the requested SDK dependency. Mobius owns
// this isolated config and disables external plugins, so materialize that exact compatibility state
// before spawn. This avoids a hidden registry request and ~62 MB first-run install while retaining a
// versioned, inspectable marker that can be removed if external plugins become a product capability.
export const managedOpencodeOfflineConfigFiles = (opencodeDir: string): AgentConfigFile[] => {
  const dependencies = { [PLUGIN_PACKAGE]: PRODUCT.managedOpencodeVersion }
  return [
    {
      path: join(opencodeDir, '.gitignore'),
      content: ['node_modules', 'package.json', 'package-lock.json', 'bun.lock', '.gitignore'].join(
        '\n'
      )
    },
    {
      path: join(opencodeDir, 'package.json'),
      content: JSON.stringify({ name: PACKAGE_NAME, private: true, dependencies }, null, 2)
    },
    {
      path: join(opencodeDir, 'package-lock.json'),
      content: JSON.stringify(
        {
          name: PACKAGE_NAME,
          lockfileVersion: 3,
          requires: true,
          packages: { '': { name: PACKAGE_NAME, dependencies } }
        },
        null,
        2
      )
    },
    {
      path: join(opencodeDir, 'node_modules', '.mobius-managed-offline'),
      content:
        `Mobius Science ${PRODUCT.managedOpencodeVersion}: external OpenCode plugins are disabled; ` +
        'this directory prevents OpenCode from downloading its plugin SDK during startup.\n'
    }
  ]
}
