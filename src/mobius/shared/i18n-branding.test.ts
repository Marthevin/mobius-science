import { describe, expect, it } from 'vitest'

import {
  COMMON_NAMESPACE,
  createI18nInstance,
  initializeI18nInstance,
  RENDERER_NAMESPACE
} from '../../shared/i18n/core'
import { applyMobiusProductBrand } from './i18n-branding'

describe('Mobius product branding', () => {
  it('brands source-English copy without changing named scientific services', () => {
    expect(applyMobiusProductBrand('Open Science is ready.')).toBe('Mobius Science is ready.')
    expect(applyMobiusProductBrand('Install Open-Science in Applications.')).toBe(
      'Install Mobius Science in Applications.'
    )
    expect(applyMobiusProductBrand('Search the Open Science Framework.')).toBe(
      'Search the Open Science Framework.'
    )
  })

  it('brands English fallback and translated resource output through the shared i18n seam', () => {
    const english = initializeI18nInstance(createI18nInstance(), {
      locale: 'en',
      namespaces: [RENDERER_NAMESPACE, COMMON_NAMESPACE],
      defaultNamespace: RENDERER_NAMESPACE,
      fallbackNamespaces: [COMMON_NAMESPACE]
    })
    expect(english.t('Starting Open Science…')).toBe('Starting Mobius Science…')

    const simplifiedChinese = initializeI18nInstance(createI18nInstance(), {
      locale: 'zh-Hans',
      resources: {
        'zh-Hans': {
          renderer: {
            'Starting Open Science…': '正在启动 Open Science…'
          },
          common: {}
        }
      },
      namespaces: [RENDERER_NAMESPACE, COMMON_NAMESPACE],
      defaultNamespace: RENDERER_NAMESPACE,
      fallbackNamespaces: [COMMON_NAMESPACE]
    })
    expect(simplifiedChinese.t('Starting Open Science…')).toBe('正在启动 Mobius Science…')
  })
})
