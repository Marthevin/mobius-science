import { describe, expect, it } from 'vitest'

import {
  SESSION_PACKAGE_DIALOG_EXTENSIONS,
  SESSION_PACKAGE_EXTENSION,
  isSessionPackagePath
} from './session-package-branding'

describe('Mobius Session package branding', () => {
  it('exports .mobius while accepting legacy .science packages', () => {
    expect(SESSION_PACKAGE_EXTENSION).toBe('.mobius')
    expect(SESSION_PACKAGE_DIALOG_EXTENSIONS).toEqual(['mobius', 'science'])
    expect(isSessionPackagePath('/tmp/study.mobius')).toBe(true)
    expect(isSessionPackagePath('/tmp/study.SCIENCE')).toBe(true)
    expect(isSessionPackagePath('/tmp/study.zip')).toBe(false)
  })
})
