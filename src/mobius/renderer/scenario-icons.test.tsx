import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MobiusScenarioIcon, type MobiusScenarioIconId } from './scenario-icons'

const scenarioIds: readonly MobiusScenarioIconId[] = [
  'subagent',
  'reviewer',
  'vision',
  'session-details'
]

describe('Mobius scenario icons', () => {
  it.each(scenarioIds)('renders %s in the application stroke-icon system', (id) => {
    const markup = renderToStaticMarkup(<MobiusScenarioIcon id={id} className="size-4" />)

    expect(markup.startsWith('<svg')).toBe(true)
    expect(markup).toContain(`data-scenario-icon="${id}"`)
    expect(markup).toContain('data-icon-layer="infinity-cloud"')
    expect(markup).toContain('data-icon-layer="scene-core"')
    expect(markup).toContain('fill="currentColor"')
    expect(markup.match(/<(?:circle|ellipse)\b/g)?.length ?? 0).toBeGreaterThanOrEqual(28)
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).not.toMatch(/data-icon-layer="orbit-(?:primary|secondary)"/)
    expect(markup).not.toMatch(/<(?:img|filter|linearGradient|radialGradient)\b/)
  })
})
