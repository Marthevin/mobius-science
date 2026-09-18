import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Mobius native icon registration', () => {
  it('loads the macOS Dock variants from the isolated Mobius assets', async () => {
    const source = await readFile(join(process.cwd(), 'src/main/index.ts'), 'utf8')

    expect(source).toContain("import('../../mobius/generated/app/icon.png?asset')")
    expect(source).toContain("import('../../mobius/generated/app/icon-dark.png?asset')")
    expect(source).not.toContain("import('../../resources/icon.png?asset')")
    expect(source).not.toContain("import('../../resources/icon-dark.png?asset')")
  })
})
