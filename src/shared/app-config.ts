// Compatibility view for callers that have not moved to the product capability manifest yet.
// Product identity comes from config/product.json; external links are removed with their owning
// features during the Mobius distribution conversion.

import { PRODUCT } from '../mobius/shared/product-config'

export const APP = {
  name: PRODUCT.displayName,
  githubOwner: '',
  githubRepo: '',
  links: {
    website: '',
    docs: '',
    githubRepo: '',
    license: '',
    githubReleases: '',
    githubApi: '',
    githubIssues: '',
    githubFeedback: '',
    discord: '',
    x: ''
  },
  copyright: PRODUCT.copyright,
  update: {
    manifestUrl: '',
    downloadPage: ''
  }
} as const
