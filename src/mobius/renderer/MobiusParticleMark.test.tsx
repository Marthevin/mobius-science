import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MobiusParticleMark } from './MobiusParticleMark'

describe('MobiusParticleMark', () => {
  it('renders a dense monochrome infinity cloud for neutral application surfaces', () => {
    const markup = renderToStaticMarkup(<MobiusParticleMark className="size-24" />)

    expect(markup).toContain('data-mobius-particle-mark="true"')
    expect(markup).toContain('fill="currentColor"')
    expect(markup.match(/<ellipse\b/g)?.length ?? 0).toBeGreaterThanOrEqual(64)
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toMatch(/<(?:filter|linearGradient|radialGradient)\b/)
  })
})
