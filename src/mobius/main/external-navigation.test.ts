import { describe, expect, it } from 'vitest'

import { isOriginalProductUrl } from './external-navigation'

describe('Mobius external navigation policy', () => {
  it('blocks upstream product origins while allowing scientific sources', () => {
    expect(isOriginalProductUrl('https://www.aipoch.com/open-science')).toBe(true)
    expect(isOriginalProductUrl('https://statics.aipoch.com/open-science/app/stable')).toBe(true)
    expect(isOriginalProductUrl('https://github.com/aipoch/open-science/issues')).toBe(true)
    expect(isOriginalProductUrl('https://api.github.com/repos/aipoch/open-science')).toBe(true)
    expect(isOriginalProductUrl('https://pubmed.ncbi.nlm.nih.gov/123')).toBe(false)
    expect(isOriginalProductUrl('https://api.deepseek.com/v1')).toBe(false)
  })
})
