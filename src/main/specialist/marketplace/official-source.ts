import type { OfficialMarketplaceSourceConfig } from './service'

export const OFFICIAL_MARKETPLACE_SOURCE: OfficialMarketplaceSourceConfig = {
  id: 'mobius-disabled-official',
  name: 'Mobius Science Specialist Marketplace',
  repositoryUrl: 'https://github.com/mobius/disabled-specialist-marketplace',
  ref: 'published',
  metadataBaseUrls: [
    'https://disabled.mobius.invalid/specialist-marketplace/v1/',
    'https://raw.githubusercontent.com/mobius/disabled-specialist-marketplace/published/'
  ],
  artifactBaseUrls: ['https://disabled.mobius.invalid/specialist-marketplace/v1/'],
  trustedKeys: {
    'openscience-marketplace-2026-08':
      'MCowBQYDK2VwAyEAKOudx9NtRJakg0xAQFzVdz/5+T/X/xG0F6pCwUu8SQk='
  }
}
