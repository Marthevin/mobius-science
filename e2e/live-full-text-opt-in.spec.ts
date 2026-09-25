import { lookup } from 'node:dns/promises'
import { expect } from '@playwright/test'
import { test } from './fixtures/electron-app'
import { literatureItemInputSchema } from '../src/shared/literature'

// Manual network acceptance: set OPEN_SCIENCE_E2E_LIVE_FULL_TEXT=1 and point
// OPEN_SCIENCE_E2E_EXECUTABLE at an installed Mobius Science executable.
test('downloads a public arXiv PDF through the packaged Literature client', async ({
  app
}, testInfo) => {
  test.setTimeout(180_000)
  test.skip(!process.env.OPEN_SCIENCE_E2E_EXECUTABLE, 'Requires the packaged application')
  test.skip(
    process.env.OPEN_SCIENCE_E2E_LIVE_FULL_TEXT !== '1',
    'Requires an explicit opt-in to fetch a public PDF over the live network.'
  )

  const addresses = await lookup('arxiv.org', { all: true })
  console.info('Live arXiv DNS:', JSON.stringify(addresses))

  const page = await app.completeOnboarding()
  await page.evaluate(() => window.api.locale.setPreference({ preference: 'en' }))
  const item = literatureItemInputSchema.parse({
    itemType: 'journalArticle',
    title: 'Attention Is All You Need — full-text acceptance',
    identifiers: [{ scheme: 'arxiv', value: '1706.03762', isPrimary: true }]
  })
  const created = await page.evaluate(
    (input) => window.api.literature.transact({ kind: 'create-item', item: input }),
    item
  )
  const search = await page.evaluate(
    (itemId) => window.api.literature.fullText({ mode: 'search', itemId }),
    created.id
  )
  expect(search.mode).toBe('search')
  if (search.mode !== 'search') throw new Error('Unexpected full-text result')
  const candidate = search.candidates.find((value) => value.provider === 'arxiv')
  expect(candidate?.url).toBe('https://arxiv.org/pdf/1706.03762')

  const attached = await page.evaluate(
    ({ itemId, candidateId }) =>
      window.api.literature.fullText({ mode: 'attach', itemId, candidateId }),
    { itemId: created.id, candidateId: candidate!.id }
  )
  expect(attached.mode).toBe('attach')
  if (attached.mode !== 'attach') throw new Error('Unexpected attach result')
  expect(attached.item.attachments.some((value) => value.kind === 'fullText')).toBe(true)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'All references', exact: true }).click()
  await expect(page.getByText(item.title, { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('full-text-attached.png'), fullPage: true })
})
