// Compatibility view for callers that have not moved to the product capability manifest yet.
// Product identity comes from config/product.json; external links are removed with their owning
// features during the Mobius distribution conversion.

import { DEFAULT_LOCALE, type Locale } from './locale'
import { PRODUCT } from '../mobius/shared/product-config'

export const APP = {
  name: PRODUCT.displayName,
  githubOwner: '',
  githubRepo: '',
  cdnBaseUrl: '',
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

// The documentation site uses the same locale identifiers as the app. English lives at the root;
// translated homepages use a locale subdirectory. Callers supply the already-resolved app locale.
export const getDocumentationUrl = (locale: Locale): string =>
  `${APP.links.docs}${locale === DEFAULT_LOCALE ? '' : `${locale}/`}`
