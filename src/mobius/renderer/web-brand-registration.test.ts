import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Mobius remote web brand registration', () => {
  it('uses the full cosmic identity on the pre-React connection surface', async () => {
    const bootstrap = await readFile(join(process.cwd(), 'src/renderer/web/bootstrap.ts'), 'utf8')
    const artwork = await readFile(
      join(process.cwd(), 'mobius/brand/mobius-science-icon.svg'),
      'utf8'
    )

    expect(bootstrap).toContain('../../../mobius/brand/mobius-science-icon.svg?raw')
    expect(bootstrap).not.toContain('open-science-logo.svg?raw')
    expect(artwork).toContain('data-icon-layer="star-field"')
    expect(artwork).toContain('data-icon-layer="infinity-cloud"')
  })

  it('brands the connection document before JavaScript starts', async () => {
    const html = await readFile(join(process.cwd(), 'src/renderer/web/index.html'), 'utf8')

    expect(html).toContain('<meta name="application-name" content="Mobius Science Remote" />')
    expect(html).toContain('<title>Mobius Science Remote</title>')
    expect(html).toContain('<div class="open-science-connection-name">Mobius Science</div>')
    expect(html).toContain('border-radius: 11px')
    expect(html).toContain('box-shadow: 0 5px 18px rgba(29, 45, 112, 0.22)')
  })
})
