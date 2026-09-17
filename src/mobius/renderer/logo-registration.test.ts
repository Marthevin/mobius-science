import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Mobius renderer logo registration', () => {
  it.each([
    'src/renderer/src/components/AppLogo.tsx',
    'src/renderer/src/installation-assistant.ts'
  ])('loads the isolated Mobius renderer assets from %s', async (relativePath) => {
    const source = await readFile(join(process.cwd(), relativePath), 'utf8')
    expect(source).toContain('mobius/generated/renderer/logo.png')
    expect(source).toContain('mobius/generated/renderer/logo-dark.png')
    expect(source).not.toContain('@/assets/logo.png')
    expect(source).not.toContain('@/assets/logo-dark.png')
  })
})
