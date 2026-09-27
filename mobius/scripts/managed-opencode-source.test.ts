import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { assertSourceReceipt, sourcePin } from './managed-opencode-source.mjs'

describe('managed OpenCode source receipt', () => {
  it('rejects an unpatched official binary even at the required version', () => {
    expect(() => assertSourceReceipt({ version: sourcePin.version })).toThrow(/source|patch/i)
  })
  it('accepts only the pinned source, patch and models snapshot identities', () => {
    const receipt = {
      kind: 'source-patched',
      patchId: sourcePin.patchId,
      patchSha256: createHash('sha256')
        .update(
          readFileSync(
            new URL('../opencode/patches/webfetch-whole-response.patch', import.meta.url)
          )
        )
        .digest('hex'),
      regressionTestSha256: createHash('sha256')
        .update(
          readFileSync(new URL('../opencode/tests/webfetch-deadline.test.ts.txt', import.meta.url))
        )
        .digest('hex'),
      sourceArchiveSha256: sourcePin.sourceArchiveSha256,
      patchedWebfetchSha256: sourcePin.patchedWebfetchSha256,
      modelsSha256: sourcePin.modelsSha256,
      bunVersion: sourcePin.bunVersion,
      regression: 'passed'
    }
    expect(() => assertSourceReceipt(receipt)).not.toThrow()
    for (const field of [
      'patchId',
      'patchSha256',
      'regressionTestSha256',
      'sourceArchiveSha256',
      'patchedWebfetchSha256',
      'modelsSha256',
      'bunVersion',
      'regression'
    ]) {
      expect(() => assertSourceReceipt({ ...receipt, [field]: 'wrong' })).toThrow()
    }
  })
})
